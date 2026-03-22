-- Migration: add pr_url to tickets (GitHub PR created by q after done)
ALTER TABLE tickets ADD COLUMN pr_url TEXT;
