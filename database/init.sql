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

-- All films known to the server (downloading or completed)
CREATE TABLE IF NOT EXISTS films (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imdb_id VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(512) NOT NULL,
    poster TEXT,
    year VARCHAR(10),
    imdb_rating VARCHAR(10),
    genre TEXT,              -- comma-separated genre strings
    tmdb_id INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'downloading',
    progress FLOAT NOT NULL DEFAULT 0,
    download_speed BIGINT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    duration INTEGER,        -- movie runtime in seconds (from TMDB)
    eta INTEGER,             -- download ETA in seconds
    torrent_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_films_imdb_id ON films(imdb_id);

-- Films that a user has watched (started streaming)
CREATE TABLE IF NOT EXISTS watched_films (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    imdb_id VARCHAR(20) NOT NULL,
    stopped_at INTEGER DEFAULT 0,         -- playback position in seconds where user stopped
    is_completed BOOLEAN DEFAULT FALSE,   -- true if user watched to near the end (<5min remaining)
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_watched_film UNIQUE (user_id, imdb_id)
);

CREATE INDEX IF NOT EXISTS idx_watched_films_user_id ON watched_films(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_films_imdb_id ON watched_films(imdb_id);
