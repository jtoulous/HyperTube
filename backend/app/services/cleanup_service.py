import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, delete as sql_delete, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.film import Film, WatchedFilm, Comment
from app.models.download import Download
from app.services.torrent_service import TorrentService

logger = logging.getLogger(__name__)

CLEANUP_STALE_DAYS = 30 # films unwatched for this many days get deleted
CLEANUP_INTERVAL_SECONDS = 24 * 3600 # how often the check runs


async def cleanup_stale_films():
    """
    Find all films that haven't been watched in a long time and delete them, along with their torrents and related DB rows.
    """
    logger.info("[CLEANUP] Starting stale film cleanup …")
    cutoff = datetime.now(timezone.utc) - timedelta(days=CLEANUP_STALE_DAYS)

    async with AsyncSessionLocal() as session:
        # Find all films
        all_films_result = await session.execute(select(Film))
        all_films = all_films_result.scalars().all()

        stale_films: list[Film] = []

        for film in all_films:
            # Most recent watch across ALL users
            result = await session.execute(
                select(sa_func.max(WatchedFilm.watched_at))
                .where(WatchedFilm.imdb_id == film.imdb_id)
            )
            last_watched = result.scalar_one_or_none()

            if last_watched is not None:
                # Ensure timezone-aware comparison
                if last_watched.tzinfo is None:
                    last_watched = last_watched.replace(tzinfo=timezone.utc)
                if last_watched < cutoff:
                    stale_films.append(film)
            else:
                # Never watched
                created = film.created_at
                if created is not None:
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    if created < cutoff:
                        stale_films.append(film)

        if not stale_films:
            logger.info("[CLEANUP] No stale films found.")
            return

        logger.info(f"[CLEANUP] Found {len(stale_films)} stale film(s) to remove.")

        for film in stale_films:
            await _delete_film_and_torrents(session, film)

        await session.commit()
        logger.info("[CLEANUP] Stale film cleanup complete.")


async def _delete_film_and_torrents(session: AsyncSession, film: Film):
    """Delete a single film's torrents from qBittorrent and clean up all DB rows."""
    imdb_id = film.imdb_id
    logger.info(f"[CLEANUP] Removing stale film: {film.title} ({imdb_id})")

    # Collect all torrent hashes linked to this film (from downloads + film row)
    hashes_to_delete: set[str] = set()

    if film.torrent_hash:
        hashes_to_delete.add(film.torrent_hash.lower())

    dl_result = await session.execute(
        select(Download.torrent_hash).where(Download.imdb_id == imdb_id)
    )
    for row in dl_result.all():
        if row[0]:
            hashes_to_delete.add(row[0].lower())

    # Delete torrents from qBittorrent
    for torrent_hash in hashes_to_delete:
        try:
            async with TorrentService() as ts:
                await ts.delete(torrent_hash, delete_files=True)
            logger.info(f"[CLEANUP] Deleted torrent {torrent_hash}")
        except Exception as e:
            logger.warning(f"[CLEANUP] Could not delete torrent {torrent_hash}: {e}")

    # Clean up DB rows
    await session.execute(
        sql_delete(Download).where(Download.imdb_id == imdb_id)
    )
    await session.execute(
        sql_delete(WatchedFilm).where(WatchedFilm.imdb_id == imdb_id)
    )
    await session.execute(
        sql_delete(Comment).where(Comment.imdb_id == imdb_id)
    )
    await session.execute(
        sql_delete(Film).where(Film.id == film.id)
    )


async def periodic_cleanup_task():
    """Background loop that runs cleanup on a fixed interval."""
    while True:
        try:
            await cleanup_stale_films()
        except Exception as e:
            logger.error(f"[CLEANUP] Error during cleanup: {e}", exc_info=True)
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
