import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.download import Download, DownloadStatus
from app.services.torrent_service import TorrentService
from app.services.film_service import FilmService

logger = logging.getLogger(__name__)


class DownloadService:
    """
    Manages downloads: adds torrents to qBittorrent, tracks progress, stores in DB.
    """

    async def create_download(
        self,
        session: AsyncSession,
        user_id: UUID,
        title: str,
        magnet_link: str | None = None,
        torrent_url: str | None = None,
        imdb_id: str | None = None,
    ) -> Download:
        """
        Add a torrent to qBittorrent and create a Download record.
        Prefers magnet links; falls back to .torrent URL if no magnet.
        If the user already has a download with this hash, return it.
        Also registers the film in the global catalogue immediately.
        """
        torrent_hash: str | None = None

        if magnet_link:
            # Extract torrent hash from magnet link
            torrent_hash = self._get_hash_from_magnet(magnet_link)
            if not torrent_hash:
                logger.error(f"Could not extract hash from magnet: {magnet_link[:80]}…")
                raise Exception("Invalid magnet link format")
        elif not torrent_url:
            raise Exception("Either magnet_link or torrent_url is required")

        # If we already know the hash, check for an existing download
        if torrent_hash:
            existing = await session.execute(
                select(Download).where(
                    and_(Download.user_id == user_id, Download.torrent_hash == torrent_hash)
                )
            )
            existing_download = existing.scalar_one_or_none()
            if existing_download:
                logger.info(f"Download already exists for user {user_id}: {torrent_hash}")
                return existing_download

        # Add to qBittorrent
        async with TorrentService() as ts:
            if magnet_link and torrent_hash:
                success = await ts.add_magnet(
                    magnet_link,
                    category=f"hypertube-{user_id}",
                    tags=f"user:{user_id}",
                )
                if not success:
                    logger.error(f"Failed to add magnet: {magnet_link[:80]}…")
                    raise Exception("Failed to add torrent to download client")
            else:
                # Fallback: download .torrent file and upload to qBittorrent
                torrent_hash = await ts.add_torrent_url(
                    torrent_url,
                    category=f"hypertube-{user_id}",
                    tags=f"user:{user_id}",
                )
                if not torrent_hash:
                    logger.error(f"Failed to add torrent from URL: {torrent_url[:120]}…")
                    raise Exception("Failed to add torrent file to download client")

                # Check for existing download now that we know the hash
                existing = await session.execute(
                    select(Download).where(
                        and_(Download.user_id == user_id, Download.torrent_hash == torrent_hash)
                    )
                )
                existing_download = existing.scalar_one_or_none()
                if existing_download:
                    logger.info(f"Download already exists for user {user_id}: {torrent_hash}")
                    return existing_download

        # Create Download record
        download = Download(
            user_id=user_id,
            title=title,
            magnet_link=magnet_link,
            imdb_id=imdb_id,
            torrent_hash=torrent_hash,
            status=DownloadStatus.DOWNLOADING,
        )
        session.add(download)
        await session.flush()

        logger.info(f"Download created: {download.id} — {title} — hash:{torrent_hash}")

        # Register in the global films catalogue immediately (with TMDB metadata)
        if imdb_id:
            try:
                await self._register_film(session, imdb_id, title, torrent_hash)
            except Exception as e:
                logger.warning(f"Failed to register film {imdb_id} at download start: {e}")

        return download

    def _get_hash_from_magnet(self, magnet_link: str) -> str | None:
        """
        Extract the torrent hash from a magnet link by parsing the xt parameter.
        """
        if "xt=urn:btih:" in magnet_link:
            try:
                return magnet_link.split("xt=urn:btih:")[1].split("&")[0]
            except IndexError:
                pass
        return None

    async def get_user_downloads(self, session: AsyncSession, user_id: UUID) -> list[Download]:
        """
        Get all downloads for a user.
        """
        result = await session.execute(
            select(Download).where(Download.user_id == user_id).order_by(Download.created_at.desc())
        )
        return result.scalars().all()

    async def get_download(self, session: AsyncSession, download_id: UUID, user_id: UUID) -> Download | None:
        """
        Get a single download, ensuring it belongs to the user.
        """
        result = await session.execute(
            select(Download).where(
                and_(Download.id == download_id, Download.user_id == user_id)
            )
        )
        return result.scalar_one_or_none()

    async def update_progress(self, session: AsyncSession, download: Download) -> Download:
        """
        Fetch current torrent status from qBittorrent and update the Download record.
        Also syncs the global films catalogue with live progress data.
        """
        async with TorrentService() as ts:
            progress = await ts.get_progress(download.torrent_hash)
            if not progress:
                download.status = DownloadStatus.ERROR
                logger.warning(f"No progress info for {download.torrent_hash}")
            else:
                state = progress.get("state", "")

                # Map qBittorrent states
                COMPLETED_STATES = {"uploading", "forcedUP", "stalledUP", "queuedUP", "checkingUP"}
                DOWNLOADING_STATES = {
                    "downloading", "forcedDL", "metaDL", "allocating",
                    "stalledDL", "queuedDL", "checkingDL", "checkingResumeData", "moving"
                }
                PAUSED_STATES = {"pausedDL", "pausedUP"}
                ERROR_STATES = {"error", "missingFiles", "unknown"}

                if state in COMPLETED_STATES:
                    download.status = DownloadStatus.COMPLETED
                elif state in DOWNLOADING_STATES:
                    download.status = DownloadStatus.DOWNLOADING
                elif state in PAUSED_STATES:
                    download.status = DownloadStatus.PAUSED
                elif state in ERROR_STATES:
                    download.status = DownloadStatus.ERROR
                    logger.warning(f"Torrent {download.torrent_hash} in state: {state}")
                else:
                    logger.warning(f"Unknown qBittorrent state '{state}' for {download.torrent_hash}")
                    # Don't overwrite a terminal status with an ambiguous fallback
                    if download.status not in (DownloadStatus.COMPLETED, DownloadStatus.ERROR):
                        download.status = DownloadStatus.DOWNLOADING

                # Update progress fields
                download.downloaded_bytes = progress.get("downloaded", 0)
                download.total_bytes = progress.get("size", 0)
                if download.total_bytes > 0:
                    download.progress = (download.downloaded_bytes / download.total_bytes) * 100.0
                else:
                    download.progress = progress.get("progress", 0.0) * 100.0

                # Sync global films catalogue with live progress
                if download.imdb_id:
                    try:
                        await FilmService.update_film_progress(
                            session,
                            imdb_id=download.imdb_id,
                            status=download.status.value,
                            progress=download.progress,
                            download_speed=progress.get("dlspeed", 0),
                            total_bytes=download.total_bytes,
                            downloaded_bytes=download.downloaded_bytes,
                            eta=progress.get("eta"),
                        )
                    except Exception as e:
                        logger.warning(f"Failed to sync film progress for {download.imdb_id}: {e}")

        return download

    async def _register_film(self, session: AsyncSession, imdb_id: str, fallback_title: str, torrent_hash: str | None = None):
        """Fetch TMDB metadata and upsert into the global films catalogue."""
        from app.services.tmdb_service import TmdbService
        tmdb = TmdbService()
        details = await tmdb.get_by_imdb(imdb_id)

        # Parse duration from TMDB runtime string (e.g. "120 min" to 7200 seconds)
        duration_sec = None
        if details and details.get("runtime"):
            try:
                minutes = int(str(details["runtime"]).replace(" min", "").strip())
                duration_sec = minutes * 60
            except (ValueError, AttributeError):
                pass

        if details:
            await FilmService.upsert_film(
                session,
                imdb_id=imdb_id,
                title=details.get("title") or fallback_title,
                poster=details.get("poster"),
                year=details.get("year"),
                imdb_rating=details.get("imdb_rating"),
                genre=details.get("genre"),
                tmdb_id=details.get("tmdb_id"),
                duration=duration_sec,
                torrent_hash=torrent_hash,
            )
        else:
            await FilmService.upsert_film(
                session,
                imdb_id=imdb_id,
                title=fallback_title,
                torrent_hash=torrent_hash,
            )
