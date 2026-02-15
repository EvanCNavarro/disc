-- DISC: Enhanced pipeline tables
-- Adds styles, playlist_analyses, claimed_objects, and generation audit columns.

-- Styles: Replicate-specific configuration per art style
CREATE TABLE IF NOT EXISTS styles (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id),
	name TEXT NOT NULL,
	description TEXT,
	replicate_model TEXT NOT NULL,
	lora_url TEXT,
	lora_scale REAL NOT NULL DEFAULT 1.0,
	prompt_template TEXT NOT NULL,
	negative_prompt TEXT,
	guidance_scale REAL NOT NULL DEFAULT 3.5,
	num_inference_steps INTEGER NOT NULL DEFAULT 28,
	seed INTEGER,
	is_default INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Playlist analyses: the "living synopsis" per playlist
-- Captures the full extraction pipeline result for audit + change detection.
CREATE TABLE IF NOT EXISTS playlist_analyses (
	id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
	user_id TEXT NOT NULL REFERENCES users(id),
	playlist_id TEXT NOT NULL REFERENCES playlists(id),
	-- Snapshot of tracks at analysis time (JSON array of {name, artist, album})
	track_snapshot TEXT NOT NULL,
	-- Per-song extraction results (JSON: TrackExtraction[])
	track_extractions TEXT NOT NULL,
	-- Convergence result (JSON: ConvergenceResult)
	convergence_result TEXT NOT NULL,
	-- Final chosen object and aesthetic description
	chosen_object TEXT NOT NULL,
	aesthetic_context TEXT NOT NULL,
	-- Style applied
	style_id TEXT NOT NULL,
	-- Change detection vs previous analysis
	tracks_added TEXT,
	tracks_removed TEXT,
	outlier_count INTEGER NOT NULL DEFAULT 0,
	outlier_threshold REAL NOT NULL DEFAULT 0.25,
	regeneration_triggered INTEGER NOT NULL DEFAULT 0,
	-- Status: completed = full analysis, partial = lyrics failures but still usable
	status TEXT NOT NULL DEFAULT 'completed',
	trigger_type TEXT NOT NULL DEFAULT 'cron',
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_playlist_analyses_playlist ON playlist_analyses(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_analyses_user ON playlist_analyses(user_id);

-- Claimed objects: registry of symbolic objects per playlist (collision detection)
CREATE TABLE IF NOT EXISTS claimed_objects (
	id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
	user_id TEXT NOT NULL REFERENCES users(id),
	playlist_id TEXT NOT NULL REFERENCES playlists(id),
	object_name TEXT NOT NULL,
	aesthetic_context TEXT,
	source_generation_id TEXT,
	superseded_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claimed_objects_active ON claimed_objects(user_id, superseded_at);

-- Add audit columns to generations
ALTER TABLE generations ADD COLUMN replicate_prediction_id TEXT;
ALTER TABLE generations ADD COLUMN r2_key TEXT;
ALTER TABLE generations ADD COLUMN analysis_id TEXT;
ALTER TABLE generations ADD COLUMN claimed_object_id TEXT;

-- Fix column name: trigger_type (not trigger)
-- D1/SQLite doesn't support RENAME COLUMN in all versions,
-- but the column is already named trigger_type in 001_initial.sql
