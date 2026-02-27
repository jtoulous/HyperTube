import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.film import Film, WatchedFilm, Comment
from app.models.user import User

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
        """Poll qBittorrent for every film still downloading and update the DB."""
        from app.services.torrent_service import TorrentService
        from app.models.download import DownloadStatus

        result = await session.execute(
            select(Film).where(Film.status == "downloading")
        )
        downloading = result.scalars().all()
        if not downloading:
            return

        # Gather all hashes in one call
        hash_to_film = {}
        for f in downloading:
            if f.torrent_hash:
                hash_to_film[f.torrent_hash.lower()] = f
        if not hash_to_film:
            return

        try:
            async with TorrentService() as ts:
                hashes_str = "|".join(hash_to_film.keys())
                torrents = await ts.list_torrents(hashes=hashes_str)

            COMPLETED_STATES = {"uploading", "forcedUP", "stalledUP", "queuedUP", "checkingUP"}
            PAUSED_STATES = {"pausedDL", "pausedUP"}
            ERROR_STATES = {"error", "missingFiles", "unknown"}

            for t in torrents:
                film = hash_to_film.get(t["hash"].lower())
                if not film:
                    continue

                state = t.get("state", "")
                if state in COMPLETED_STATES:
                    film.status = "completed"
                elif state in PAUSED_STATES:
                    film.status = "paused"
                elif state in ERROR_STATES:
                    film.status = "error"
                else:
                    film.status = "downloading"

                film.downloaded_bytes = t.get("downloaded", 0)
                film.total_bytes = t.get("size", 0)
                if film.total_bytes > 0:
                    film.progress = (film.downloaded_bytes / film.total_bytes) * 100.0
                else:
                    film.progress = t.get("progress", 0.0) * 100.0
                film.download_speed = t.get("dlspeed", 0)
                film.eta = t.get("eta")

                # Safety net: if progress >= 100% the film is done regardless
                # of what qBittorrent reports as its state
                if film.progress >= 99.9:
                    film.status = "completed"

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
    def compute_can_watch(film: Film) -> tuple[bool, int | None]:
        """
        Determine whether a sequentially-downloading film can be streamed
        without interruption.

        Returns (can_watch, ready_in_seconds):
            can_watch        – True means playback can start now.
            ready_in_seconds – 0 if ready, None if unknowable, else positive int.

        Math (uniform-bitrate assumption):
            At time *t* after pressing play we need:
                downloaded_fraction + (speed * t / total) >= t / duration
            Worst case is t = duration to min_p = 1 - speed*duration/total
        """
        if film.status == "completed":
            return True, 0

        if film.status in ("error", "paused"):
            return False, None

        # downloading
        progress_frac = (film.progress or 0) / 100.0

        # If the file is essentially complete, allow watching immediately
        if progress_frac >= 0.99:
            return True, 0

        dlspeed = film.download_speed or 0
        total = film.total_bytes or 0
        dur = film.duration  # seconds

        # If any critical value is missing we can't compute
        if not dur or dur <= 0 or total <= 0:
            # Fallback: allow if almost done
            return (progress_frac >= 0.95, None)

        effective_speed = dlspeed * SPEED_SAFETY_FACTOR

        bitrate = total / dur  # average bytes/sec for the file

        if effective_speed >= bitrate and progress_frac > 0.01:
            # Download is faster than real-time playback, safe to watch
            return True, 0

        # Minimum progress fraction needed
        min_p = max(0.0, 1.0 - (effective_speed * dur) / total) + BUFFER_MARGIN

        if progress_frac >= min_p:
            return True, 0

        # Not ready yet — estimate how long until we reach min_p
        if dlspeed <= 0:
            return False, None

        deficit_bytes = (min_p - progress_frac) * total
        ready_in = int(deficit_bytes / dlspeed) + 1
        return False, ready_in

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

    # ─── Comments ───────────────────────────────────────────────────

    @staticmethod
    async def get_comments(session: AsyncSession, imdb_id: str) -> list[dict]:
        """Return all comments for a film, newest first, with username + avatar."""
        result = await session.execute(
            select(Comment, User.username, User.profile_picture)
            .join(User, Comment.user_id == User.id)
            .where(Comment.imdb_id == imdb_id)
            .order_by(Comment.created_at.desc())
        )
        return [
            {
                "id": str(row[0].id),
                "user_id": str(row[0].user_id),
                "username": row[1] or "Unknown",
                "profile_picture": row[2],
                "imdb_id": row[0].imdb_id,
                "text": row[0].text,
                "created_at": row[0].created_at.isoformat(),
            }
            for row in result.all()
        ]

    @staticmethod
    async def add_comment(session: AsyncSession, user_id: UUID, imdb_id: str, text: str) -> Comment:
        """Add a comment on a film."""
        comment = Comment(user_id=user_id, imdb_id=imdb_id, text=text)
        session.add(comment)
        await session.flush()
        await session.refresh(comment)
        return comment

    @staticmethod
    async def delete_comment(session: AsyncSession, comment_id: UUID, user_id: UUID) -> bool:
        """Delete a comment (only its author can delete)."""
        result = await session.execute(
            delete(Comment).where(
                Comment.id == comment_id,
                Comment.user_id == user_id,
            )
        )
        return result.rowcount > 0
