import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.security import get_current_user
from app.services.film_service import FilmService
from app.services.torrent_service import TorrentService
from app.schemas.film import FilmResponse, WatchedFilmResponse, MarkWatchedRequest, UpdateProgressRequest, CommentResponse, CreateCommentRequest
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/films", tags=["films"])

VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm"}


@router.get("", response_model=list[FilmResponse])
async def list_films(
    session: AsyncSession = Depends(get_db),
):
    """List all films on the server (downloading + completed) with can_watch info."""
    # Refresh live progress from qBittorrent for any still-downloading films
    await FilmService.refresh_downloading_films(session)
    await session.commit()

    films = await FilmService.get_all_films(session)
    results = []
    for f in films:
        can_watch, ready_in = FilmService.compute_can_watch(f)
        data = FilmResponse.model_validate(f)
        data.can_watch = can_watch
        data.watch_ready_in = ready_in
        results.append(data)
    return results


@router.get("/{imdb_id}/files")
async def get_film_files(
    imdb_id: str,
    session: AsyncSession = Depends(get_db),
):
    """
    Return playable video files for a film, looked up by its torrent_hash.
    Works for completed downloads and partially-downloaded sequential torrents.
    """
    film = await FilmService.get_film_by_imdb(session, imdb_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")
    if not film.torrent_hash:
        raise HTTPException(status_code=404, detail="No torrent associated with this film")

    try:
        async with TorrentService() as ts:
            files = await ts.get_files(film.torrent_hash)
    except Exception as e:
        logger.error(f"Failed to list torrent files for {imdb_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch file list")

    video_files = []
    for f in files:
        name = f.get("name", "")
        ext = os.path.splitext(name)[1].lower()
        if ext in VIDEO_EXTS:
            video_files.append({
                "name": name,
                "size": f.get("size", 0),
                "stream_url": f"/api/v1/stream/{name}",
            })

    video_files.sort(key=lambda x: x["size"], reverse=True)
    return {"files": video_files}


@router.get("/watched", response_model=list[dict])
async def get_watched_films(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return list of watched films with stopped_at and is_completed."""
    return await FilmService.get_watched_imdb_ids(session, current_user.id)


@router.post("/watched", response_model=WatchedFilmResponse)
async def mark_film_watched(
    body: MarkWatchedRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a film as watched by the current user."""
    film = await FilmService.mark_watched(session, current_user.id, body.imdb_id, body.stopped_at or 0)
    await session.commit()
    return film


@router.put("/watched/progress", response_model=WatchedFilmResponse)
async def update_watch_progress(
    body: UpdateProgressRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update playback position for a film. Auto-marks completed if <5min remaining."""
    film = await FilmService.update_progress(session, current_user.id, body.imdb_id, body.stopped_at)
    await session.commit()
    return film


@router.delete("/watched/{imdb_id}")
async def unmark_film_watched(
    imdb_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove watched mark for a film."""
    deleted = await FilmService.unmark_watched(session, current_user.id, imdb_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Film not in watched list")
    await session.commit()
    return {"ok": True}


# ─── Comments ────────────────────────────────────────────────────

@router.get("/{imdb_id}/comments")
async def get_comments(
    imdb_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Get all comments for a film."""
    return await FilmService.get_comments(session, imdb_id)


@router.post("/{imdb_id}/comments")
async def add_comment(
    imdb_id: str,
    body: CreateCommentRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a comment on a film."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Comment too long (max 2000 chars)")
    comment = await FilmService.add_comment(session, current_user.id, imdb_id, text)
    await session.commit()
    return {
        "id": str(comment.id),
        "user_id": str(comment.user_id),
        "username": current_user.username or "Unknown",
        "profile_picture": current_user.profile_picture,
        "imdb_id": comment.imdb_id,
        "text": comment.text,
        "created_at": comment.created_at.isoformat(),
    }


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a comment (only by its author)."""
    from uuid import UUID as PyUUID
    try:
        cid = PyUUID(comment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comment ID")
    deleted = await FilmService.delete_comment(session, cid, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found or not yours")
    await session.commit()
    return {"ok": True}
