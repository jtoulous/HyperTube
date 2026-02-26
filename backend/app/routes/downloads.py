import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.download_service import DownloadService
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
    Creates a SHARED download entry — if the torrent already exists, returns it.
    """
    try:
        download = await download_service.create_download(
            session,
            user_id=current_user.id,
            title=data.title,
            magnet_link=data.magnet_link,
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
    Get ALL downloads (shared library — visible to all users).
    """
    downloads = await download_service.get_all_downloads(session)
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

    download = await download_service.get_download(session, download_id)
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

    download = await download_service.get_download(session, download_id)
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
    return {"files": video_files, "download_id": str(download.id)}
