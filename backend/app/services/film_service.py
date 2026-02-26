import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.film import Film, WatchedFilm

logger = logging.getLogger(__name__)

# Safety factor: only count 90% of current download speed to leave margin for fluctuations
SPEED_SAFETY_FACTOR = 0.90
# Minimum buffer: require at least 2% extra beyond the theoretical minimum
BUFFER_MARGIN = 0.02


class FilmService:
    """Manages the global film catalogue and per-user watched tracking."""

    # ── film catalogue ────────────────────────────────────────────

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
    async def get_film_by_imdb(session: AsyncSession, imdb_id: str) -> Film | None:
        result = await session.execute(
            select(Film).where(Film.imdb_id == imdb_id)
        )
        return result.scalar_one_or_none()

    # ── can-watch computation ──────────────────────────────────

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
            Worst case is t = duration → min_p = 1 - speed*duration/total
        """
        if film.status == "completed":
            return True, 0

        if film.status in ("error", "paused"):
            return False, None

        # downloading
        progress_frac = (film.progress or 0) / 100.0
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

    # ── watched tracking ──────────────────────────────────────

    @staticmethod
    async def mark_watched(session: AsyncSession, user_id: UUID, imdb_id: str) -> WatchedFilm:
        """Mark a film as watched by a user (idempotent)."""
        stmt = pg_insert(WatchedFilm).values(
            user_id=user_id,
            imdb_id=imdb_id,
        ).on_conflict_do_nothing(
            constraint="uq_user_watched_film",
        ).returning(WatchedFilm)

        result = await session.execute(stmt)
        film = result.scalar_one_or_none()

        if film is None:
            # Already existed, fetch it
            result2 = await session.execute(
                select(WatchedFilm).where(
                    WatchedFilm.user_id == user_id,
                    WatchedFilm.imdb_id == imdb_id,
                )
            )
            film = result2.scalar_one()

        logger.info(f"Marked watched: user={user_id}, imdb_id={imdb_id}")
        return film

    @staticmethod
    async def get_watched_imdb_ids(session: AsyncSession, user_id: UUID) -> list[str]:
        """Return the list of imdb_ids that a user has watched."""
        result = await session.execute(
            select(WatchedFilm.imdb_id).where(WatchedFilm.user_id == user_id)
        )
        return [row[0] for row in result.all()]

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
