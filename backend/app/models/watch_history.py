import uuid
from sqlalchemy import Column, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class WatchHistory(Base):
    __tablename__ = "watch_history"
    __table_args__ = (
        UniqueConstraint("user_id", "download_id", name="uq_user_download_watch"),
    )

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    download_id = Column(UUID(as_uuid=True), ForeignKey("downloads.id", ondelete="CASCADE"), nullable=False, index=True)

    # Watch tracking
    last_position = Column(Float, default=0.0, nullable=False)   # seconds into the video
    duration = Column(Float, default=0.0, nullable=False)        # total video duration in seconds
    completed = Column(Boolean, default=False, nullable=False)   # true if user finished the film

    # Timestamps
    last_watched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    download = relationship("Download", foreign_keys=[download_id])
