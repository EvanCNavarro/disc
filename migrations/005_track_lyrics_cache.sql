-- Track lyrics cache
-- Caches lyrics snippets per Spotify track ID so cross-playlist songs don't re-fetch from lyrics.ovh.

CREATE TABLE IF NOT EXISTS track_lyrics (
  spotify_track_id TEXT PRIMARY KEY,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  lyrics_snippet TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
