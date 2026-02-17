-- Add thumbnail_url column to styles table
-- Stores the URL of a canonical boombox image generated in each style
ALTER TABLE styles ADD COLUMN thumbnail_url TEXT;
