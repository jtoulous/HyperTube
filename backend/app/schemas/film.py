from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class FilmResponse(BaseModel):
    id: UUID
    imdb_id: str
    title: str
    poster: Optional[str] = None
    year: Optional[str] = None
    imdb_rating: Optional[str] = None
    genre: Optional[str] = None
    tmdb_id: Optional[int] = None

    # Download tracking
    status: str = "downloading"
    progress: float = 0.0
    download_speed: int = 0
    total_bytes: int = 0
    downloaded_bytes: int = 0
    duration: Optional[int] = None   # movie runtime in seconds
    eta: Optional[int] = None        # download ETA in seconds

    # Computed by the route handler
    can_watch: bool = False
    watch_ready_in: Optional[int] = None   # seconds until watchable (0 if now, None if unknown)

    created_at: datetime

    class Config:
        from_attributes = True


class WatchedFilmResponse(BaseModel):
    id: UUID
    user_id: UUID
    imdb_id: str
    stopped_at: int = 0
    is_completed: bool = False
    watched_at: datetime

    class Config:
        from_attributes = True


class MarkWatchedRequest(BaseModel):
    imdb_id: str
    stopped_at: Optional[int] = 0


class UpdateProgressRequest(BaseModel):
    imdb_id: str
    stopped_at: int


class CommentResponse(BaseModel):
    id: UUID
    user_id: UUID
    username: str = ""
    profile_picture: Optional[str] = None
    imdb_id: str
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class CreateCommentRequest(BaseModel):
    text: str
    movie_id: Optional[str] = None   # imdb_id, required for POST /comments (not needed when in URL)


class UpdateCommentRequest(BaseModel):
    text: str
