import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.download import Download
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
        # Compute availability string
        if f.status == "completed" and can_watch:
            data.availability = "fully_available"
        elif can_watch:
            data.availability = "partially_available"
        elif f.status == "downloading":
            data.availability = "downloading"
        else:
            data.availability = "not_available"
        results.append(data)
    return results


@router.get("/{imdb_id}/files")
async def get_film_files(
    imdb_id: str,
    session: AsyncSession = Depends(get_db),
):
    """
    Return playable video files for a film across ALL its associated torrents.
    Works for completed downloads and partially-downloaded sequential torrents.
    """
    film = await FilmService.get_film_by_imdb(session, imdb_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    # Gather every torrent hash linked to this film (same logic as /torrents)
    hashes: set[str] = set()
    if film.torrent_hash:
        hashes.add(film.torrent_hash.lower())
    if imdb_id.startswith("noid-"):
        hashes.add(imdb_id[5:].lower())
    else:
        result = await session.execute(
            select(Download.torrent_hash).where(Download.imdb_id == imdb_id).distinct()
        )
        for row in result.all():
            if row[0]:
                hashes.add(row[0].lower())

    if not hashes:
        return {"files": []}

    video_files = []
    seen_names: set[str] = set()
    try:
        async with TorrentService() as ts:
            for h in sorted(hashes):
                files = await ts.get_files(h)
                for f in files:
                    name = f.get("name", "")
                    if name in seen_names:
                        continue
                    ext = os.path.splitext(name)[1].lower()
                    if ext in VIDEO_EXTS:
                        seen_names.add(name)
                        video_files.append({
                            "name": name,
                            "size": f.get("size", 0),
                            "stream_url": f"/api/v1/stream/{name}",
                            "torrent_hash": h,
                        })
    except Exception as e:
        logger.error(f"Failed to list torrent files for {imdb_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch file list")

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


# ─── Comments (film-scoped, kept for convenience) ──────────────

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
    """Add a comment on a film (POST /movies/:movie_id/comments variant)."""
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
# ─── Torrent listing for a film ─────────────────────────────────

COMPLETED_STATES = {"uploading", "forcedUP", "stalledUP", "queuedUP", "checkingUP",
                    "pausedUP", "stoppedUP"}  # seeding paused = download done
PAUSED_STATES = {"pausedDL", "stoppedDL"}  # download paused
ERROR_STATES = {"error", "missingFiles", "unknown"}


@router.get("/{imdb_id}/torrents")
async def get_film_torrents(
    imdb_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all torrents associated with a film, each with live status
    from qBittorrent plus control actions.
    """
    film = await FilmService.get_film_by_imdb(session, imdb_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    # Collect all unique torrent hashes for this film
    hashes: set[str] = set()
    if film.torrent_hash:
        hashes.add(film.torrent_hash.lower())

    if imdb_id.startswith("noid-"):
        # Hash is embedded in the synthetic imdb_id
        hashes.add(imdb_id[5:].lower())
    else:
        # Check downloads table for any torrents with this imdb_id
        result = await session.execute(
            select(Download.torrent_hash).where(Download.imdb_id == imdb_id).distinct()
        )
        for row in result.all():
            if row[0]:
                hashes.add(row[0].lower())

    # Also grab title from downloads, keyed by hash
    title_map: dict[str, str] = {}
    if hashes:
        result = await session.execute(
            select(Download.torrent_hash, Download.title).where(
                Download.torrent_hash.in_([h for h in hashes])
            )
        )
        for row in result.all():
            if row[0]:
                title_map[row[0].lower()] = row[1]

    # Fetch live status from qBittorrent
    torrents = []
    if hashes:
        try:
            async with TorrentService() as ts:
                hashes_str = "|".join(hashes)
                qbt_list = await ts.list_torrents(hashes=hashes_str)
            qbt_map = {t["hash"].lower(): t for t in qbt_list}

            for h in sorted(hashes):
                t = qbt_map.get(h)
                if not t:
                    # Torrent no longer in qBittorrent — skip silently
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

                total = t.get("size", 0)
                downloaded = t.get("downloaded", 0)
                progress = (downloaded / total * 100) if total > 0 else (t.get("progress", 0) * 100)

                # Per-torrent availability
                t_can_watch, t_ready_in = FilmService.compute_torrent_can_watch(
                    mapped, round(progress, 1), t.get("dlspeed", 0), total, film.duration,
                )

                torrents.append({
                    "hash": h,
                    "name": t.get("name", title_map.get(h, "Unknown")),
                    "status": mapped,
                    "progress": round(progress, 1),
                    "download_speed": t.get("dlspeed", 0),
                    "eta": t.get("eta"),
                    "total_bytes": total,
                    "downloaded_bytes": downloaded,
                    "can_watch": t_can_watch,
                    "watch_ready_in": t_ready_in,
                })
        except Exception as e:
            logger.error(f"Failed to fetch torrent info for film {imdb_id}: {e}")
            # On error, return empty rather than fake error entries
            pass

    return {"torrents": torrents}
