-- Cover integrity: phash tracking, generation soft-delete, URL change detection
ALTER TABLE generations ADD COLUMN cover_phash TEXT;
ALTER TABLE generations ADD COLUMN deleted_at TEXT;
ALTER TABLE playlists ADD COLUMN last_seen_cover_url TEXT;
ALTER TABLE playlists ADD COLUMN cover_verified_at TEXT;
ALTER TABLE worker_ticks ADD COLUMN integrity_checked INTEGER DEFAULT 0;
ALTER TABLE worker_ticks ADD COLUMN integrity_flagged INTEGER DEFAULT 0;
