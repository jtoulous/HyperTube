import uuid
from sqlalchemy import Column, String, Float, BigInteger, DateTime, Enum as SQLEnum, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.database import Base

class DownloadStatus(str, enum.Enum):
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"

class Download(Base):
    __tablename__ = "downloads"
    __table_args__ = (
        UniqueConstraint("torrent_hash", name="uq_torrent_hash"),
    )

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Who first added this download (informational, not a filter)
    added_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    # Metadata
    title = Column(String(512), nullable=False)
    imdb_id = Column(String(20), nullable=True, index=True)  # e.g., "tt1375666"
    magnet_link = Column(Text, nullable=False)
    torrent_hash = Column(String(64), nullable=False, index=True)  # qBittorrent hash

    # Status and progress
    status = Column(SQLEnum(DownloadStatus, create_type=False, native_enum=False), default=DownloadStatus.DOWNLOADING, nullable=False)
    progress = Column(Float, default=0.0, nullable=False)  # 0.0 to 100.0
    downloaded_bytes = Column(BigInteger, default=0, nullable=False)
    total_bytes = Column(BigInteger, default=0, nullable=False)

    # Last time anyone watched this film (used for auto-cleanup after 1 month)
    last_watched_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    added_by_user = relationship("User", foreign_keys=[added_by])
