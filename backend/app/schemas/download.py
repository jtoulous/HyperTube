from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from enum import Enum
from typing import Optional

class DownloadStatusEnum(str, Enum):
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"

class DownloadCreate(BaseModel):
    title: str
    magnet_link: str
    imdb_id: str | None = None

class DownloadResponse(BaseModel):
    id: UUID
    title: str
    magnet_link: str
    imdb_id: str | None
    torrent_hash: str
    status: DownloadStatusEnum
    progress: float
    downloaded_bytes: int
    total_bytes: int
    last_watched_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DownloadProgressResponse(BaseModel):
    id: UUID
    title: str
    status: DownloadStatusEnum
    progress: float
    downloaded_bytes: int
    total_bytes: int
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Watch History schemas ──────────────────────────────────────────────────────

class WatchProgressUpdate(BaseModel):
    download_id: UUID
    position: float = Field(..., ge=0, description="Current position in seconds")
    duration: float = Field(..., ge=0, description="Total video duration in seconds")

class WatchProgressResponse(BaseModel):
    download_id: UUID
    last_position: float
    duration: float
    completed: bool
    last_watched_at: datetime

    class Config:
        from_attributes = True

class WatchHistoryResponse(BaseModel):
    download_id: UUID
    last_position: float
    duration: float
    completed: bool
    last_watched_at: datetime
    download_title: str | None = None
    download_imdb_id: str | None = None

    class Config:
        from_attributes = True
