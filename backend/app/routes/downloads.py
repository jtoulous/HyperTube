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
    Returns the created Download object.
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

    # Update progress from qBittorrent
    download = await download_service.update_progress(session, download)
    await session.commit()

    return download
