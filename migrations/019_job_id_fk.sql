-- Add job_id FK to playlists so queue/status can join instead of
-- using the broken 2-hour time-window heuristic.
ALTER TABLE playlists ADD COLUMN job_id TEXT;
