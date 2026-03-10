import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base
from app.routes import router as api_router
from app.models import User, Download, Film, WatchedFilm
from app.services.cleanup_service import periodic_cleanup_task


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Start periodic cleanup of stale torrents (unwatched for 30+ days)
    cleanup_task = asyncio.create_task(periodic_cleanup_task())

    yield

    # cancel cleanup task and dispose engine
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
