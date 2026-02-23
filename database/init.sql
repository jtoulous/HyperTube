CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table supporting both email/password and OAuth authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255), -- Nullable for OAUTH users
    auth_provider VARCHAR(50) NOT NULL CHECK (auth_provider IN ('EMAIL', 'FORTYTWO', 'GITHUB')),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    fortytwo_id VARCHAR(255) UNIQUE, -- FortyTwo OAuth user ID
    github_id VARCHAR(255) UNIQUE, -- GitHub OAuth user ID
    profile_picture TEXT, -- URL to profile picture
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    CONSTRAINT check_auth_method CHECK (
        password_hash IS NOT NULL OR fortytwo_id IS NOT NULL OR github_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_fortytwo_id ON users(fortytwo_id);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
