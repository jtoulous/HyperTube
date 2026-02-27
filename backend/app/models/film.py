import uuid
from sqlalchemy import Column, String, Integer, Float, BigInteger, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base


class Film(Base):
    """A film tracked by the server — downloading or completed."""
    __tablename__ = "films"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    imdb_id = Column(String(80), nullable=False, unique=True, index=True)
    title = Column(String(512), nullable=False)
    poster = Column(Text, nullable=True)
    year = Column(String(10), nullable=True)
    imdb_rating = Column(String(10), nullable=True)
    genre = Column(Text, nullable=True)  # comma-separated
    tmdb_id = Column(Integer, nullable=True)

    # Download tracking
    status = Column(String(20), nullable=False, default="downloading")
    progress = Column(Float, nullable=False, default=0.0)           # 0-100
    download_speed = Column(BigInteger, nullable=False, default=0)   # bytes/s
    total_bytes = Column(BigInteger, nullable=False, default=0)
    downloaded_bytes = Column(BigInteger, nullable=False, default=0)
    duration = Column(Integer, nullable=True)     # movie runtime in seconds (from TMDB)
    eta = Column(Integer, nullable=True)          # download ETA in seconds
    torrent_hash = Column(String(64), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WatchedFilm(Base):
    """Tracks which user has watched (started streaming) which film."""
    __tablename__ = "watched_films"
    __table_args__ = (
        UniqueConstraint("user_id", "imdb_id", name="uq_user_watched_film"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    imdb_id = Column(String(80), nullable=False, index=True)
    stopped_at = Column(Integer, nullable=False, default=0)         # playback position in seconds
    is_completed = Column(Boolean, nullable=False, default=False)   # true if watched to near the end
    watched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Comment(Base):
    """User comments on a film."""
    __tablename__ = "comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    imdb_id = Column(String(20), nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
