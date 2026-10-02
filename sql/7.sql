-- Migration: per-ticket effort level
-- effort: reasoning effort for the next run (NULL = CLI default); passed as `claude --effort`
ALTER TABLE tickets ADD COLUMN effort TEXT;
