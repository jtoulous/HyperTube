import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.download_service import DownloadService
from app.services.torrent_service import TorrentService
from app.schemas.download import DownloadCreate, DownloadResponse, DownloadProgressResponse
from app.models.user import User
from app.security import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/downloads", tags=["downloads"])
download_service = DownloadService()


@router.post("", response_model=DownloadResponse)
async def create_download(
    data: DownloadCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a new torrent download (magnet link).
    Returns the created Download object.
    """
    try:
        download = await download_service.create_download(
            session,
            user_id=current_user.id,
            title=data.title,
            magnet_link=data.magnet_link,
            torrent_url=data.torrent_url,
            imdb_id=data.imdb_id,
        )
        await session.commit()
        await session.refresh(download)
        return download
    except Exception as e:
        logger.error(f"Failed to create download: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=list[DownloadResponse])
async def get_downloads(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all downloads for the current user.
    """
    downloads = await download_service.get_user_downloads(session, current_user.id)
    return downloads


@router.get("/{download_id}/progress", response_model=DownloadProgressResponse)
async def get_download_progress(
    download_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current progress of a download (fetches from qBittorrent).
    """
    from uuid import UUID
    try:
        download_id = UUID(download_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid download ID")

    download = await download_service.get_download(session, download_id, current_user.id)
    if not download:
        raise HTTPException(status_code=404, detail="Download not found")

    # Terminal statuses are final — trust the DB, skip qBittorrent entirely
    from app.models.download import DownloadStatus
    if download.status not in (DownloadStatus.COMPLETED, DownloadStatus.ERROR):
        download = await download_service.update_progress(session, download)
        await session.commit()
        await session.refresh(download)

    return download


@router.get("/{download_id}/files")
async def get_download_files(
    download_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List playable video files for a completed download.
    Returns filenames relative to /downloads, ready to pass to /api/v1/stream/{filename}.
    """
    from uuid import UUID
    from app.services.torrent_service import TorrentService

    VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm"}

    try:
        download_id = UUID(download_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid download ID")

    download = await download_service.get_download(session, download_id, current_user.id)
    if not download:
        raise HTTPException(status_code=404, detail="Download not found")

    try:
        async with TorrentService() as ts:
            files = await ts.get_files(download.torrent_hash)
    except Exception as e:
        logger.error(f"Failed to list torrent files: {e}")
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

    # Sort by size descending (main feature film is typically the largest)
    video_files.sort(key=lambda x: x["size"], reverse=True)
    return {"files": video_files}


# ─── Per-torrent controls (by hash) ────────────────────────────

@router.post("/torrent/{torrent_hash}/pause")
async def pause_torrent(
    torrent_hash: str,
    current_user: User = Depends(get_current_user),
):
    """Pause (stop) a torrent by its hash."""
    try:
        async with TorrentService() as ts:
            await ts.pause(torrent_hash)
    except Exception as e:
        logger.error(f"Failed to pause torrent {torrent_hash}: {e}")
        raise HTTPException(status_code=500, detail="Could not pause torrent")
    return {"ok": True}


@router.post("/torrent/{torrent_hash}/resume")
async def resume_torrent(
    torrent_hash: str,
    current_user: User = Depends(get_current_user),
):
    """Resume (start) a torrent by its hash."""
    try:
        async with TorrentService() as ts:
            await ts.resume(torrent_hash)
    except Exception as e:
        logger.error(f"Failed to resume torrent {torrent_hash}: {e}")
        raise HTTPException(status_code=500, detail="Could not resume torrent")
    return {"ok": True}


@router.delete("/torrent/{torrent_hash}")
async def delete_torrent(
    torrent_hash: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a torrent from qBittorrent. Also cleans up download rows and orphaned films."""
    from sqlalchemy import delete as sql_delete
    from app.models.download import Download
    from app.models.film import Film

    try:
        async with TorrentService() as ts:
            await ts.delete(torrent_hash, delete_files=True)
    except Exception as e:
        logger.error(f"Failed to delete torrent {torrent_hash}: {e}")
        raise HTTPException(status_code=500, detail="Could not delete torrent")

    # Collect imdb_ids affected before deleting rows
    result = await session.execute(
        select(Download.imdb_id).where(Download.torrent_hash == torrent_hash).distinct()
    )
    affected_imdb_ids = [row[0] for row in result.all() if row[0]]

    # Delete all download rows with this hash
    await session.execute(
        sql_delete(Download).where(Download.torrent_hash == torrent_hash)
    )

    # Clean up films that were linked to this hash and have no remaining downloads.
    # Also handle noid-{hash} films.
    films_to_check = set(affected_imdb_ids)
    films_to_check.add(f"noid-{torrent_hash}")

    # Also look up any Film whose torrent_hash column matches the deleted hash
    res = await session.execute(
        select(Film).where(Film.torrent_hash == torrent_hash)
    )
    stale_films = res.scalars().all()
    for f in stale_films:
        films_to_check.add(f.imdb_id)

    for imdb_id in films_to_check:
        # Check if any downloads still reference this imdb_id
        remaining = await session.execute(
            select(Download.torrent_hash).where(Download.imdb_id == imdb_id).limit(1)
        )
        remaining_row = remaining.first()
        if not remaining_row:
            # No downloads left → delete the film
            await session.execute(
                sql_delete(Film).where(Film.imdb_id == imdb_id)
            )
        else:
            # Film still exists but its torrent_hash may point to the deleted hash.
            # Update it to a remaining download's hash.
            film_res = await session.execute(
                select(Film).where(Film.imdb_id == imdb_id)
            )
            film_obj = film_res.scalar_one_or_none()
            if film_obj and film_obj.torrent_hash and film_obj.torrent_hash.lower() == torrent_hash.lower():
                film_obj.torrent_hash = remaining_row[0]

    await session.commit()
    return {"ok": True}


@router.post("/torrent/{torrent_hash}/recheck")
async def recheck_torrent(
    torrent_hash: str,
    current_user: User = Depends(get_current_user),
):
    """Force recheck a torrent by its hash."""
    try:
        async with TorrentService() as ts:
            await ts.recheck(torrent_hash)
    except Exception as e:
        logger.error(f"Failed to recheck torrent {torrent_hash}: {e}")
        raise HTTPException(status_code=500, detail="Could not recheck torrent")
    return {"ok": True}


@router.post("/torrent/{torrent_hash}/reannounce")
async def reannounce_torrent(
    torrent_hash: str,
    current_user: User = Depends(get_current_user),
):
    """Force reannounce a torrent to trackers by its hash."""
    try:
        async with TorrentService() as ts:
            await ts.reannounce(torrent_hash)
    except Exception as e:
        logger.error(f"Failed to reannounce torrent {torrent_hash}: {e}")
        raise HTTPException(status_code=500, detail="Could not reannounce torrent")
    return {"ok": True}
