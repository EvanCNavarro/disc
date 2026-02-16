-- Song-level extraction cache
-- Caches LLM-extracted symbolic objects per Spotify track ID.
-- Cross-playlist songs reuse cached extractions instead of re-calling the LLM.

CREATE TABLE IF NOT EXISTS song_extractions (
  spotify_track_id TEXT PRIMARY KEY,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  extraction_json TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
