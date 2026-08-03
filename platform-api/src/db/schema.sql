CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('unused', 'used', 'disabled')),
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
  client_version TEXT NOT NULL,
  device_public_id TEXT NOT NULL UNIQUE,
  device_secret_hash TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
  channel TEXT NOT NULL CHECK (channel IN ('internal', 'stable')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  sha256 TEXT NOT NULL,
  release_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS download_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  release_id TEXT NOT NULL REFERENCES releases(id),
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS interaction_events (
  id TEXT PRIMARY KEY,
  source_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  pair_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);
