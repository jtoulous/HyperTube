CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table supporting both email/password and OAuth authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255), -- Nullable for OAUTH users
    auth_provider VARCHAR(50) NOT NULL CHECK (auth_provider IN ('EMAIL', 'FORTYTWO', 'GITHUB', 'DISCORD')),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    fortytwo_id VARCHAR(255) UNIQUE, -- FortyTwo OAuth user ID
    github_id VARCHAR(255) UNIQUE, -- GitHub OAuth user ID
    discord_id VARCHAR(255) UNIQUE, -- Discord OAuth user ID
    profile_picture TEXT, -- URL to profile picture
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    CONSTRAINT check_auth_method CHECK (
        password_hash IS NOT NULL OR fortytwo_id IS NOT NULL OR github_id IS NOT NULL OR discord_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_fortytwo_id ON users(fortytwo_id);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Shared downloads table (one entry per torrent, visible to ALL users)
CREATE TABLE IF NOT EXISTS downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    added_by UUID REFERENCES users(id),       -- who first triggered the download (nullable)
    title VARCHAR(512) NOT NULL,
    imdb_id VARCHAR(20),
    magnet_link TEXT NOT NULL,
    torrent_hash VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'downloading',
    progress FLOAT DEFAULT 0.0,
    downloaded_bytes BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    last_watched_at TIMESTAMPTZ,               -- for auto-cleanup after 1 month
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_downloads_imdb_id ON downloads(imdb_id);
CREATE INDEX IF NOT EXISTS idx_downloads_torrent_hash ON downloads(torrent_hash);
CREATE INDEX IF NOT EXISTS idx_downloads_added_by ON downloads(added_by);

-- Per-user watch history / progress tracking
CREATE TABLE IF NOT EXISTS watch_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    download_id UUID NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
    last_position FLOAT DEFAULT 0.0,           -- playback position in seconds
    duration FLOAT DEFAULT 0.0,                -- total video duration in seconds
    completed BOOLEAN DEFAULT FALSE,           -- true when user finished the film
    last_watched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, download_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_download_id ON watch_history(download_id);
