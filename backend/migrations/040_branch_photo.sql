-- Migration 040: Add photo_url column to branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS photo_url TEXT;
