-- Add changelog last-seen tracking for "What's New" indicator
ALTER TABLE users ADD COLUMN changelog_last_seen_version TEXT;
