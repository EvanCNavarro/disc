-- Playlist classification columns
-- Enables filtering collaborative and non-owned playlists from cover generation.
ALTER TABLE playlists ADD COLUMN is_collaborative INTEGER NOT NULL DEFAULT 0;
ALTER TABLE playlists ADD COLUMN owner_spotify_id TEXT;
