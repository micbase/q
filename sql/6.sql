-- Migration: per-ticket model selection
-- model:         model requested for the next run (NULL = CLI default); passed as `claude --model`
-- current_model: model reported by the CLI's init event on the most recent run
ALTER TABLE tickets ADD COLUMN model TEXT;
ALTER TABLE tickets ADD COLUMN current_model TEXT;
