from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base
from app.routes import router as api_router
from app.models import User, Download, Film, WatchedFilm  # Import models to register them with Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Migrate downloads table: replace global unique(torrent_hash) with unique(user_id, torrent_hash)
        await conn.execute(__import__("sqlalchemy").text("""
            DO $$
            BEGIN
                -- Drop old global unique index on torrent_hash if it exists
                IF EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE tablename = 'downloads' AND indexname = 'ix_downloads_torrent_hash'
                ) THEN
                    DROP INDEX ix_downloads_torrent_hash;
                END IF;
                -- Drop old unique constraint if it exists
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'downloads_torrent_hash_key' AND conrelid = 'downloads'::regclass
                ) THEN
                    ALTER TABLE downloads DROP CONSTRAINT downloads_torrent_hash_key;
                END IF;
                -- Add per-user unique constraint if not already present
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_user_torrent_hash' AND conrelid = 'downloads'::regclass
                ) THEN
                    ALTER TABLE downloads ADD CONSTRAINT uq_user_torrent_hash UNIQUE (user_id, torrent_hash);
                END IF;
            END $$;
        """))

        # Migrate available_films → films (rename + add new columns)
        await conn.execute(__import__("sqlalchemy").text("""
            DO $$
            BEGIN
                -- Rename table if old name still exists
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'available_films')
                   AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'films') THEN
                    ALTER TABLE available_films RENAME TO films;
                END IF;
                -- Add new columns to films if they don't exist yet
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'films') THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='status') THEN
                        ALTER TABLE films ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'completed';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='progress') THEN
                        ALTER TABLE films ADD COLUMN progress FLOAT NOT NULL DEFAULT 100;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='download_speed') THEN
                        ALTER TABLE films ADD COLUMN download_speed BIGINT NOT NULL DEFAULT 0;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='total_bytes') THEN
                        ALTER TABLE films ADD COLUMN total_bytes BIGINT NOT NULL DEFAULT 0;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='downloaded_bytes') THEN
                        ALTER TABLE films ADD COLUMN downloaded_bytes BIGINT NOT NULL DEFAULT 0;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='duration') THEN
                        ALTER TABLE films ADD COLUMN duration INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='eta') THEN
                        ALTER TABLE films ADD COLUMN eta INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='films' AND column_name='torrent_hash') THEN
                        ALTER TABLE films ADD COLUMN torrent_hash VARCHAR(64);
                    END IF;
                END IF;
            END $$;
        """))

    yield
    # Shutdown: dispose engine
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
