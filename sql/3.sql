-- Migration: add dev_server_pid to tickets
ALTER TABLE tickets ADD COLUMN dev_server_pid INTEGER NOT NULL DEFAULT 0;
