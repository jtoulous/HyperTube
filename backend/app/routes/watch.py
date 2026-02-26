import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from datetime import datetime, timezone
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.download import Download
from app.models.watch_history import WatchHistory
from app.schemas.download import WatchProgressUpdate, WatchProgressResponse, WatchHistoryResponse
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/watch", tags=["watch"])

# How many seconds before the end to consider a film "completed"
COMPLETION_THRESHOLD = 300  # 5 minutes


@router.post("/progress", response_model=WatchProgressResponse)
async def save_watch_progress(
    data: WatchProgressUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save the user's current watch position for a film.
    If the position is within the last 5 minutes of the film's duration,
    automatically mark the film as completed/watched.
    Also updates download.last_watched_at for auto-cleanup tracking.
    """
    # Verify the download exists
    dl_result = await session.execute(
        select(Download).where(Download.id == data.download_id)
    )
    download = dl_result.scalar_one_or_none()
    if not download:
        raise HTTPException(status_code=404, detail="Download not found")

    now = datetime.now(timezone.utc)

    # Determine if the user has "finished" the film
    completed = False
    if data.duration > 0 and data.position >= (data.duration - COMPLETION_THRESHOLD):
        completed = True

    # Upsert watch history
    existing = await session.execute(
        select(WatchHistory).where(
            and_(
                WatchHistory.user_id == current_user.id,
                WatchHistory.download_id == data.download_id,
            )
        )
    )
    watch = existing.scalar_one_or_none()

    if watch:
        watch.last_position = data.position
        watch.duration = data.duration
        watch.last_watched_at = now
        if completed:
            watch.completed = True
    else:
        watch = WatchHistory(
            user_id=current_user.id,
            download_id=data.download_id,
            last_position=data.position,
            duration=data.duration,
            completed=completed,
            last_watched_at=now,
        )
        session.add(watch)

    # Update the download's last_watched_at (used by auto-cleanup)
    download.last_watched_at = now

    await session.flush()

    return WatchProgressResponse(
        download_id=data.download_id,
        last_position=watch.last_position,
        duration=watch.duration,
        completed=watch.completed,
        last_watched_at=watch.last_watched_at,
    )


@router.get("/progress/{download_id}", response_model=WatchProgressResponse)
async def get_watch_progress(
    download_id: UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the current user's watch progress for a specific film.
    """
    result = await session.execute(
        select(WatchHistory).where(
            and_(
                WatchHistory.user_id == current_user.id,
                WatchHistory.download_id == download_id,
            )
        )
    )
    watch = result.scalar_one_or_none()

    if not watch:
        raise HTTPException(status_code=404, detail="No watch history found")

    return WatchProgressResponse(
        download_id=watch.download_id,
        last_position=watch.last_position,
        duration=watch.duration,
        completed=watch.completed,
        last_watched_at=watch.last_watched_at,
    )


@router.get("/history")
async def get_watch_history(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the current user's complete watch history.
    Returns a dict mapping download_id → watch info, for easy frontend lookups.
    """
    result = await session.execute(
        select(WatchHistory).where(WatchHistory.user_id == current_user.id)
    )
    records = result.scalars().all()

    history = {}
    for w in records:
        history[str(w.download_id)] = {
            "download_id": str(w.download_id),
            "last_position": w.last_position,
            "duration": w.duration,
            "completed": w.completed,
            "last_watched_at": w.last_watched_at.isoformat() if w.last_watched_at else None,
        }

    return {"history": history}
