-- Add style creator columns to styles table
ALTER TABLE styles ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE styles ADD COLUMN heuristics TEXT;
ALTER TABLE styles ADD COLUMN version TEXT NOT NULL DEFAULT '1.0';

-- Style version history
CREATE TABLE IF NOT EXISTS style_versions (
  id TEXT PRIMARY KEY,
  style_id TEXT NOT NULL REFERENCES styles(id),
  version TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  heuristics TEXT NOT NULL,
  preview_urls TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reference images for style creation
CREATE TABLE IF NOT EXISTS style_references (
  id TEXT PRIMARY KEY,
  style_id TEXT NOT NULL REFERENCES styles(id),
  image_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
