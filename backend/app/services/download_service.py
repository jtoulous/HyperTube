import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.download import Download, DownloadStatus
from app.services.torrent_service import TorrentService

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
        magnet_link: str,
        imdb_id: str | None = None,
    ) -> Download:
        """
        Add a torrent to qBittorrent and create a Download record.
        If the user already has a download with this hash, return it.
        """
        # Extract torrent hash from magnet link
        torrent_hash = self._get_hash_from_magnet(magnet_link)
        if not torrent_hash:
            logger.error(f"Could not extract hash from magnet: {magnet_link[:80]}…")
            raise Exception("Invalid magnet link format")

        # Check if this user already has a download with this hash
        existing = await session.execute(
            select(Download).where(
                and_(Download.user_id == user_id, Download.torrent_hash == torrent_hash)
            )
        )
        existing_download = existing.scalar_one_or_none()
        if existing_download:
            logger.info(f"Download already exists for user {user_id}: {torrent_hash}")
            return existing_download

        # Add magnet to qBittorrent
        async with TorrentService() as ts:
            success = await ts.add_magnet(
                magnet_link,
                category=f"hypertube-{user_id}",
                tags=f"user:{user_id}",
            )
            if not success:
                logger.error(f"Failed to add magnet: {magnet_link[:80]}…")
                raise Exception("Failed to add torrent to download client")

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

        return download
