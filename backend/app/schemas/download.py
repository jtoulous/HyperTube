from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from enum import Enum

class DownloadStatusEnum(str, Enum):
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"

class DownloadCreate(BaseModel):
    title: str
    magnet_link: str | None = None
    torrent_url: str | None = None
    imdb_id: str | None = None

class DownloadResponse(BaseModel):
    id: UUID
    title: str
    magnet_link: str | None = None
    imdb_id: str | None
    torrent_hash: str
    status: DownloadStatusEnum
    progress: float
    downloaded_bytes: int
    total_bytes: int
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
