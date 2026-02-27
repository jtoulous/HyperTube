import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.film import Film, WatchedFilm

logger = logging.getLogger(__name__)

SPEED_SAFETY_FACTOR = 0.90
BUFFER_MARGIN = 0.02
WATCHED_THRESHOLD_SECONDS = 300


class FilmService:
    """Manages the global film catalogue and per-user watched tracking."""

    @staticmethod
    async def upsert_film(
        session: AsyncSession,
        imdb_id: str,
        title: str,
        poster: str | None = None,
        year: str | None = None,
        imdb_rating: str | None = None,
        genre: str | None = None,
        tmdb_id: int | None = None,
        status: str = "downloading",
        progress: float = 0.0,
        download_speed: int = 0,
        total_bytes: int = 0,
        downloaded_bytes: int = 0,
        duration: int | None = None,
        eta: int | None = None,
        torrent_hash: str | None = None,
    ) -> Film:
        """Insert or update a film (idempotent on imdb_id)."""
        stmt = pg_insert(Film).values(
            imdb_id=imdb_id,
            title=title,
            poster=poster,
            year=year,
            imdb_rating=imdb_rating,
            genre=genre,
            tmdb_id=tmdb_id,
            status=status,
            progress=progress,
            download_speed=download_speed,
            total_bytes=total_bytes,
            downloaded_bytes=downloaded_bytes,
            duration=duration,
            eta=eta,
            torrent_hash=torrent_hash,
        ).on_conflict_do_update(
            index_elements=["imdb_id"],
            set_=dict(
                title=title, poster=poster, year=year, imdb_rating=imdb_rating,
                genre=genre, tmdb_id=tmdb_id, status=status, progress=progress,
                download_speed=download_speed, total_bytes=total_bytes,
                downloaded_bytes=downloaded_bytes, duration=duration, eta=eta,
                torrent_hash=torrent_hash,
            ),
        ).returning(Film)

        result = await session.execute(stmt)
        film = result.scalar_one()
        logger.info(f"Upserted film: {imdb_id} — {title} [{status} {progress:.1f}%]")
        return film

    @staticmethod
    async def update_film_progress(
        session: AsyncSession,
        imdb_id: str,
        status: str,
        progress: float,
        download_speed: int,
        total_bytes: int,
        downloaded_bytes: int,
        eta: int | None,
    ):
        """Update only the download-progress fields for a film."""
        stmt = pg_insert(Film).values(
            imdb_id=imdb_id, title="Unknown",
            status=status, progress=progress,
            download_speed=download_speed, total_bytes=total_bytes,
            downloaded_bytes=downloaded_bytes, eta=eta,
        ).on_conflict_do_update(
            index_elements=["imdb_id"],
            set_=dict(
                status=status, progress=progress,
                download_speed=download_speed, total_bytes=total_bytes,
                downloaded_bytes=downloaded_bytes, eta=eta,
            ),
        )
        await session.execute(stmt)

    @staticmethod
    async def get_all_films(session: AsyncSession) -> list[Film]:
        """List every film on the server."""
        result = await session.execute(
            select(Film).order_by(Film.created_at.desc())
        )
        return result.scalars().all()

    @staticmethod
    async def refresh_downloading_films(session: AsyncSession):
        """Poll qBittorrent for non-completed films and update the DB.

        Considers ALL torrent hashes per film (from Film.torrent_hash and the
        Downloads table) so that multi-torrent films reflect their best status.
        """
        from app.services.torrent_service import TorrentService
        from app.models.download import Download

        result = await session.execute(
            select(Film).where(
                Film.status.in_(["downloading", "paused", "error"]),
            )
        )
        all_films = result.scalars().all()
        if not all_films:
            return

        film_by_imdb: dict[str, Film] = {f.imdb_id: f for f in all_films}

        # Gather ALL hashes per film
        hashes_by_imdb: dict[str, set[str]] = {}
        for f in all_films:
            if f.torrent_hash:
                hashes_by_imdb.setdefault(f.imdb_id, set()).add(f.torrent_hash.lower())
            if f.imdb_id.startswith("noid-"):
                hashes_by_imdb.setdefault(f.imdb_id, set()).add(f.imdb_id[5:].lower())

        imdb_ids = list(film_by_imdb.keys())
        if imdb_ids:
            dl_result = await session.execute(
                select(Download.imdb_id, Download.torrent_hash).where(
                    Download.imdb_id.in_(imdb_ids)
                ).distinct()
            )
            for row in dl_result.all():
                if row[0] and row[1]:
                    hashes_by_imdb.setdefault(row[0], set()).add(row[1].lower())

        # Collect all unique hashes
        all_hashes: set[str] = set()
        for hs in hashes_by_imdb.values():
            all_hashes.update(hs)

        if not all_hashes:
            return

        try:
            async with TorrentService() as ts:
                hashes_str = "|".join(all_hashes)
                torrents = await ts.list_torrents(hashes=hashes_str)

            COMPLETED_STATES = {"uploading", "forcedUP", "stalledUP", "queuedUP", "checkingUP",
                                "pausedUP", "stoppedUP"}
            PAUSED_STATES = {"pausedDL", "stoppedDL"}
            ERROR_STATES = {"error", "missingFiles", "unknown"}
            STATUS_RANK = {"completed": 4, "downloading": 3, "paused": 2, "error": 1}

            qbt_map = {t["hash"].lower(): t for t in torrents}
            returned_hashes = set(qbt_map.keys())

            for imdb_id, hashes in hashes_by_imdb.items():
                film = film_by_imdb.get(imdb_id)
                if not film:
                    continue

                best_rank = 0
                best_mapped = None
                best_t = None

                for h in hashes:
                    t = qbt_map.get(h)
                    if not t:
                        continue

                    state = t.get("state", "")
                    if state in COMPLETED_STATES:
                        mapped = "completed"
                    elif state in PAUSED_STATES:
                        mapped = "paused"
                    elif state in ERROR_STATES:
                        mapped = "error"
                    else:
                        mapped = "downloading"

                    rank = STATUS_RANK.get(mapped, 0)
                    if rank > best_rank:
                        best_rank = rank
                        best_mapped = mapped
                        best_t = t

                if best_t and best_mapped:
                    film.status = best_mapped
                    film.downloaded_bytes = best_t.get("downloaded", 0)
                    film.total_bytes = best_t.get("size", 0)
                    if film.total_bytes > 0:
                        film.progress = (film.downloaded_bytes / film.total_bytes) * 100.0
                    else:
                        film.progress = best_t.get("progress", 0.0) * 100.0
                    film.download_speed = best_t.get("dlspeed", 0)
                    film.eta = best_t.get("eta")

                    if film.progress >= 99.9:
                        film.status = "completed"
                else:
                    # No torrents found in qBittorrent for this film
                    if not any(h in returned_hashes for h in hashes):
                        # Check if any Download rows still reference this film
                        dl_check = await session.execute(
                            select(Download.torrent_hash).where(
                                Download.imdb_id == imdb_id
                            ).limit(1)
                        )
                        if dl_check.first():
                            # Downloads exist but torrents gone from qBittorrent
                            logger.info(f"All torrents for film {imdb_id} gone from qBittorrent, marking error")
                            film.status = "error"
                            film.download_speed = 0
                            film.eta = None
                        else:
                            # No downloads, no torrents → orphaned film, delete it
                            logger.info(f"Film {imdb_id} has no downloads and no torrents, deleting")
                            await session.delete(film)

            # Also clean up any non-completed films that have no hashes at all
            for imdb_id, film in film_by_imdb.items():
                if imdb_id not in hashes_by_imdb or not hashes_by_imdb[imdb_id]:
                    dl_check = await session.execute(
                        select(Download.torrent_hash).where(
                            Download.imdb_id == imdb_id
                        ).limit(1)
                    )
                    if not dl_check.first():
                        logger.info(f"Film {imdb_id} has no hashes and no downloads, deleting")
                        await session.delete(film)

            await session.flush()
        except Exception as e:
            logger.warning(f"Failed to refresh downloading films from qBittorrent: {e}")

    @staticmethod
    async def get_film_by_imdb(session: AsyncSession, imdb_id: str) -> Film | None:
        result = await session.execute(
            select(Film).where(Film.imdb_id == imdb_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def compute_torrent_can_watch(
        status: str,
        progress: float,
        download_speed: int,
        total_bytes: int,
        duration: int | None,
    ) -> tuple[bool, int | None]:
        """
        Per-torrent availability computation.

        Returns (can_watch, ready_in_seconds):
            can_watch        – True means playback can start now.
            ready_in_seconds – 0 if ready, None if unknowable, else positive int.

        Math (uniform-bitrate assumption):
            At time *t* after pressing play we need:
                downloaded_fraction + (speed * t / total) >= t / duration
            Worst case is t = duration → min_p = 1 - speed*duration/total
        """
        if status == "completed":
            return True, 0

        if status in ("error", "paused"):
            return False, None

        # downloading
        progress_frac = (progress or 0) / 100.0

        if progress_frac >= 0.99:
            return True, 0

        dlspeed = download_speed or 0
        total = total_bytes or 0
        dur = duration

        if not dur or dur <= 0 or total <= 0:
            return (progress_frac >= 0.95, None)

        effective_speed = dlspeed * SPEED_SAFETY_FACTOR
        bitrate = total / dur

        if effective_speed >= bitrate and progress_frac > 0.01:
            return True, 0

        min_p = max(0.0, 1.0 - (effective_speed * dur) / total) + BUFFER_MARGIN

        if progress_frac >= min_p:
            return True, 0

        if dlspeed <= 0:
            return False, None

        deficit_bytes = (min_p - progress_frac) * total
        ready_in = int(deficit_bytes / dlspeed) + 1
        return False, ready_in

    @staticmethod
    def compute_can_watch(film: Film) -> tuple[bool, int | None]:
        """Film-level convenience wrapper around compute_torrent_can_watch."""
        return FilmService.compute_torrent_can_watch(
            film.status, film.progress, film.download_speed,
            film.total_bytes, film.duration,
        )

    @staticmethod
    async def mark_watched(
        session: AsyncSession, user_id: UUID, imdb_id: str, stopped_at: int = 0
    ) -> WatchedFilm:
        """Mark a film as watched by a user (idempotent on user+imdb_id).

        Automatically sets is_completed=True when the remaining time
        (film.duration − stopped_at) is less than 5 minutes.
        """
        # Look up the film to get duration for is_completed computation
        is_completed = False
        film = await session.execute(
            select(Film).where(Film.imdb_id == imdb_id)
        )
        film_row = film.scalar_one_or_none()
        if film_row and film_row.duration and film_row.duration > 0:
            remaining = film_row.duration - stopped_at
            if remaining <= WATCHED_THRESHOLD_SECONDS:
                is_completed = True

        stmt = pg_insert(WatchedFilm).values(
            user_id=user_id,
            imdb_id=imdb_id,
            stopped_at=stopped_at,
            is_completed=is_completed,
        ).on_conflict_do_update(
            constraint="uq_user_watched_film",
            set_=dict(
                stopped_at=stopped_at,
                is_completed=is_completed,
            ),
        ).returning(WatchedFilm)

        result = await session.execute(stmt)
        watched = result.scalar_one()

        logger.info(
            f"Marked watched: user={user_id}, imdb_id={imdb_id}, "
            f"stopped_at={stopped_at}, is_completed={is_completed}"
        )
        return watched

    @staticmethod
    async def update_progress(
        session: AsyncSession, user_id: UUID, imdb_id: str, stopped_at: int
    ) -> WatchedFilm:
        """Update playback position for a film the user is watching.

        Creates the watched_films row if it doesn't exist yet.
        Automatically sets is_completed when remaining < 5 min.
        """
        return await FilmService.mark_watched(session, user_id, imdb_id, stopped_at)

    @staticmethod
    async def get_watched_imdb_ids(session: AsyncSession, user_id: UUID) -> list[dict]:
        """Return the list of watched films with their status for a user."""
        result = await session.execute(
            select(
                WatchedFilm.imdb_id,
                WatchedFilm.stopped_at,
                WatchedFilm.is_completed,
            ).where(WatchedFilm.user_id == user_id)
        )
        return [
            {"imdb_id": row[0], "stopped_at": row[1], "is_completed": row[2]}
            for row in result.all()
        ]

    @staticmethod
    async def unmark_watched(session: AsyncSession, user_id: UUID, imdb_id: str) -> bool:
        """Remove watched mark. Returns True if a row was deleted."""
        result = await session.execute(
            delete(WatchedFilm).where(
                WatchedFilm.user_id == user_id,
                WatchedFilm.imdb_id == imdb_id,
            )
        )
        return result.rowcount > 0

    @staticmethod
    async def delete_film(session: AsyncSession, imdb_id: str) -> bool:
        """Delete a film from the catalogue. Returns True if a row was deleted."""
        result = await session.execute(
            delete(Film).where(Film.imdb_id == imdb_id)
        )
        return result.rowcount > 0
