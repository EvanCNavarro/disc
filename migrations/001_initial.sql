-- DISC: Initial schema
-- Applied to Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
	spotify_user_id TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	email TEXT NOT NULL DEFAULT '',
	avatar_url TEXT,
	encrypted_refresh_token TEXT NOT NULL,
	style_preference TEXT NOT NULL DEFAULT 'bleached-crosshatch',
	cron_enabled INTEGER NOT NULL DEFAULT 0,
	cron_time TEXT NOT NULL DEFAULT '04:20',
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	last_login_at TEXT NOT NULL DEFAULT (datetime('now')),
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS playlists (
	id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
	user_id TEXT NOT NULL REFERENCES users(id),
	spotify_playlist_id TEXT NOT NULL,
	name TEXT NOT NULL,
	description TEXT,
	track_count INTEGER NOT NULL DEFAULT 0,
	spotify_cover_url TEXT,
	status TEXT NOT NULL DEFAULT 'idle',
	last_generated_at TEXT,
	generation_count INTEGER NOT NULL DEFAULT 0,
	style_override TEXT,
	cron_enabled INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE(user_id, spotify_playlist_id)
);

CREATE TABLE IF NOT EXISTS generations (
	id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
	playlist_id TEXT NOT NULL REFERENCES playlists(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	style_id TEXT NOT NULL,
	symbolic_object TEXT NOT NULL,
	dall_e_prompt TEXT NOT NULL,
	image_url TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	error_message TEXT,
	duration_ms INTEGER,
	cost_usd REAL,
	trigger_type TEXT NOT NULL DEFAULT 'manual',
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
	id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
	user_id TEXT NOT NULL REFERENCES users(id),
	type TEXT NOT NULL DEFAULT 'manual',
	status TEXT NOT NULL DEFAULT 'pending',
	total_playlists INTEGER NOT NULL DEFAULT 0,
	completed_playlists INTEGER NOT NULL DEFAULT 0,
	failed_playlists INTEGER NOT NULL DEFAULT 0,
	total_cost_usd REAL,
	started_at TEXT NOT NULL DEFAULT (datetime('now')),
	completed_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_playlist_id ON generations(playlist_id);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_users_spotify_user_id ON users(spotify_user_id);
