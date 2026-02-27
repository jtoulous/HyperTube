from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID as PyUUID
from app.database import get_db
from app.models.user import User
from app.security import get_current_user
from app.services.film_service import FilmService
from app.schemas.film import CreateCommentRequest, UpdateCommentRequest
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comments", tags=["comments"])


@router.get("")
async def get_latest_comments(
    session: AsyncSession = Depends(get_db),
):
    """
    GET /comments
    Returns a list of latest comments which includes comment's author username,
    date, content, and id.
    """
    return await FilmService.get_all_comments(session)


@router.get("/{comment_id}")
async def get_comment(
    comment_id: str,
    session: AsyncSession = Depends(get_db),
):
    """
    GET /comments/:id
    Returns comment, author's username, comment id, date posted.
    """
    try:
        cid = PyUUID(comment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comment ID")
    comment = await FilmService.get_comment_by_id(session, cid)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


@router.post("")
async def create_comment(
    body: CreateCommentRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    POST /comments
    Expected data: comment (text), movie_id (imdb_id). Rest is filled by the server.
    """
    if not body.movie_id:
        raise HTTPException(status_code=400, detail="movie_id is required")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Comment too long (max 2000 chars)")
    comment = await FilmService.add_comment(session, current_user.id, body.movie_id, text)
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


@router.patch("/{comment_id}")
async def update_comment(
    comment_id: str,
    body: UpdateCommentRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    PATCH /comments/:id
    Expected data: comment (text), username.
    """
    try:
        cid = PyUUID(comment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comment ID")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Comment too long (max 2000 chars)")
    updated = await FilmService.update_comment(session, cid, current_user.id, text)
    if not updated:
        raise HTTPException(status_code=404, detail="Comment not found or not yours")
    await session.commit()
    return updated


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    DELETE /comments/:id
    """
    try:
        cid = PyUUID(comment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comment ID")
    deleted = await FilmService.delete_comment(session, cid, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found or not yours")
    await session.commit()
    return {"ok": True}
