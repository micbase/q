-- Migration: remove dev_server_pid from tickets (pid tracked in-memory only)
ALTER TABLE tickets DROP COLUMN dev_server_pid;
