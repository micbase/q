-- Migration: add dev_server_status to tickets
CREATE TYPE dev_server_status AS ENUM ('stopped', 'starting', 'running', 'error');
ALTER TABLE tickets ADD COLUMN dev_server_status dev_server_status NOT NULL DEFAULT 'stopped';
