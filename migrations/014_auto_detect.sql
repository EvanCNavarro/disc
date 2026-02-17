-- Auto-detect: watcher state for new playlist detection
ALTER TABLE playlists ADD COLUMN auto_detected_at TEXT;
ALTER TABLE playlists ADD COLUMN auto_detect_snapshot TEXT;
ALTER TABLE playlists ADD COLUMN auto_detect_status TEXT DEFAULT NULL;
-- auto_detect_status: NULL (not auto-detected), 'watching', 'stable', 'triggered'

-- Soft delete: mark playlists removed from Spotify
ALTER TABLE playlists ADD COLUMN deleted_at TEXT;
