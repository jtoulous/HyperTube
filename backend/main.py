from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base
from app.routes import router as api_router
from app.models import User, Download  # Import models to register them with Base


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
