-- DISC: Queue features + column cleanup
-- Renames stale DALL-E column and adds progress tracking for queue UI.

-- Rename stale column: dall_e_prompt → prompt
ALTER TABLE generations RENAME COLUMN dall_e_prompt TO prompt;

-- Add progress tracking to playlists (JSON blob for step-by-step status)
ALTER TABLE playlists ADD COLUMN progress_data TEXT;
