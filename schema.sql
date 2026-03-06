CREATE DATABASE IF NOT EXISTS q CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE q;

CREATE TABLE IF NOT EXISTS projects (
  id           VARCHAR(21)  NOT NULL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  status       ENUM('active','archived','deleted') NOT NULL DEFAULT 'active',
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id           VARCHAR(21)  NOT NULL PRIMARY KEY,
  project_id   VARCHAR(21)  NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT         NOT NULL,
  priority     TINYINT      NOT NULL DEFAULT 3,
  -- 1=Critical 2=High 3=Normal 4=Low 5=Whenever
  status       ENUM('queued','running','paused','done','failed','deleted') NOT NULL DEFAULT 'queued',
  error        TEXT,
  created_at   BIGINT       NOT NULL,  -- unix ms
  updated_at   BIGINT       NOT NULL,
  started_at   BIGINT,
  completed_at BIGINT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_status_priority (status, priority, created_at)
);

CREATE TABLE IF NOT EXISTS messages (
  id           VARCHAR(21)  NOT NULL PRIMARY KEY,
  ticket_id    VARCHAR(21)  NOT NULL,
  role         ENUM('user','assistant','system') NOT NULL,
  content      TEXT         NOT NULL,
  event_type   VARCHAR(64)  NOT NULL,
  -- 'text' | 'tool_use' | 'tool_result' | 'done' | 'paused' | 'error'
  created_at   BIGINT       NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  INDEX idx_ticket_created (ticket_id, created_at)
);
