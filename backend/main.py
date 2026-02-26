from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.routes import router as api_router
from app.models import User, Download, WatchHistory  # Import models to register them with Base

logger = logging.getLogger(__name__)


# ─── Background task: auto-delete films unwatched for 1 month ─────────────────

async def cleanup_unwatched_films():
    """
    Periodically delete films that haven't been watched by anyone in 30 days.
    Runs every hour. A film is stale if:
      - last_watched_at is older than 30 days, OR
      - last_watched_at is NULL and created_at is older than 30 days
    Only targets completed downloads (don't delete in-progress ones).
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select, delete, or_, and_
    from app.models.download import Download, DownloadStatus
    from app.models.watch_history import WatchHistory
    from app.services.torrent_service import TorrentService
    import os, shutil

    while True:
        await asyncio.sleep(3600)  # every hour
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)

            async with AsyncSessionLocal() as session:
                # Find stale completed downloads
                result = await session.execute(
                    select(Download).where(
                        and_(
                            Download.status == DownloadStatus.COMPLETED,
                            or_(
                                and_(Download.last_watched_at != None, Download.last_watched_at < cutoff),
                                and_(Download.last_watched_at == None, Download.created_at < cutoff),
                            ),
                        )
                    )
                )
                stale_downloads = result.scalars().all()

                if not stale_downloads:
                    continue

                logger.info(f"Auto-cleanup: found {len(stale_downloads)} stale film(s)")

                for dl in stale_downloads:
                    try:
                        # Remove from qBittorrent
                        async with TorrentService() as ts:
                            await ts.delete(dl.torrent_hash, delete_files=True)
                        logger.info(f"Deleted torrent {dl.torrent_hash} ({dl.title})")
                    except Exception as e:
                        logger.warning(f"Failed to remove torrent {dl.torrent_hash} from qBittorrent: {e}")

                    # Delete watch history for this download
                    await session.execute(
                        delete(WatchHistory).where(WatchHistory.download_id == dl.id)
                    )
                    # Delete the download record
                    await session.delete(dl)

                await session.commit()
                logger.info(f"Auto-cleanup: removed {len(stale_downloads)} stale film(s)")

        except Exception as e:
            logger.error(f"Auto-cleanup error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # ── Schema migrations ──────────────────────────────────────────────
        await conn.execute(__import__("sqlalchemy").text("""
            DO $$
            BEGIN
                -- ── Downloads table: migrate from per-user to shared ──

                -- Drop old per-user unique constraint
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_user_torrent_hash' AND conrelid = 'downloads'::regclass
                ) THEN
                    ALTER TABLE downloads DROP CONSTRAINT uq_user_torrent_hash;
                END IF;

                -- Drop old global unique index on torrent_hash if it exists
                IF EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE tablename = 'downloads' AND indexname = 'ix_downloads_torrent_hash'
                ) THEN
                    DROP INDEX ix_downloads_torrent_hash;
                END IF;

                -- Drop old unique constraint
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'downloads_torrent_hash_key' AND conrelid = 'downloads'::regclass
                ) THEN
                    ALTER TABLE downloads DROP CONSTRAINT downloads_torrent_hash_key;
                END IF;

                -- Add new shared unique constraint on torrent_hash
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_torrent_hash' AND conrelid = 'downloads'::regclass
                ) THEN
                    -- First, deduplicate: keep only the oldest row per torrent_hash
                    DELETE FROM downloads d1
                    USING downloads d2
                    WHERE d1.torrent_hash = d2.torrent_hash
                      AND d1.created_at > d2.created_at;

                    ALTER TABLE downloads ADD CONSTRAINT uq_torrent_hash UNIQUE (torrent_hash);
                END IF;

                -- Rename user_id → added_by if column still named user_id
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'downloads' AND column_name = 'user_id'
                ) THEN
                    ALTER TABLE downloads RENAME COLUMN user_id TO added_by;
                    -- Make it nullable (shared downloads don't mandate a user)
                    ALTER TABLE downloads ALTER COLUMN added_by DROP NOT NULL;
                END IF;

                -- Add last_watched_at column if missing
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'downloads' AND column_name = 'last_watched_at'
                ) THEN
                    ALTER TABLE downloads ADD COLUMN last_watched_at TIMESTAMPTZ;
                END IF;
            END $$;
        """))

    # Start background cleanup task
    cleanup_task = asyncio.create_task(cleanup_unwatched_films())

    yield

    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


app = FastAPI(
    title="HyperTube",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
