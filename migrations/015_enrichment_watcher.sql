-- Migration 015: Playlist enrichment + watcher settings
-- Adds metadata columns for richer playlist data and user-level watcher config.

-- Playlist enrichment
ALTER TABLE playlists ADD COLUMN snapshot_id TEXT;
ALTER TABLE playlists ADD COLUMN is_public INTEGER;
ALTER TABLE playlists ADD COLUMN contributor_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE playlists ADD COLUMN contributors_json TEXT;
ALTER TABLE playlists ADD COLUMN has_local_tracks INTEGER NOT NULL DEFAULT 0;

-- Watcher settings (independent of cron_enabled)
ALTER TABLE users ADD COLUMN watcher_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN watcher_interval_minutes INTEGER NOT NULL DEFAULT 5;
