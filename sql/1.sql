CREATE DATABASE q;
\c q

CREATE TYPE project_status AS ENUM ('active', 'archived', 'deleted');
CREATE TYPE ticket_status AS ENUM ('queued', 'running', 'paused', 'done', 'failed', 'deleted');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE IF NOT EXISTS projects (
  id           VARCHAR(21)      NOT NULL PRIMARY KEY,
  name         VARCHAR(255)     NOT NULL,
  github_repo  VARCHAR(255),
  status       project_status   NOT NULL DEFAULT 'active',
  created_at   BIGINT           NOT NULL,
  updated_at   BIGINT           NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id           VARCHAR(21)      NOT NULL PRIMARY KEY,
  project_id   VARCHAR(21)      NOT NULL,
  title        VARCHAR(255)     NOT NULL,
  description  TEXT             NOT NULL,
  priority     SMALLINT         NOT NULL DEFAULT 3,
  -- 1=Critical 2=High 3=Normal 4=Low 5=Whenever
  status       ticket_status    NOT NULL DEFAULT 'queued',
  error        TEXT,
  created_at   BIGINT           NOT NULL,  -- unix ms
  updated_at   BIGINT           NOT NULL,
  started_at   BIGINT,
  completed_at BIGINT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_status_priority ON tickets (status, priority, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id           VARCHAR(21)      NOT NULL PRIMARY KEY,
  ticket_id    VARCHAR(21)      NOT NULL,
  role         message_role     NOT NULL,
  content      TEXT             NOT NULL,
  type         VARCHAR(64)      NOT NULL,
  -- 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'done' | 'paused' | 'error'
  tool_name    VARCHAR(64),
  tool_use_id  VARCHAR(64),
  tool_input         TEXT,
  tool_result_content TEXT,
  tool_result_for_id  VARCHAR(64),
  is_error     BOOLEAN          NOT NULL DEFAULT false,
  parent_tool_use_id  VARCHAR(64),
  claude_session_id   VARCHAR(255),
  created_at   BIGINT           NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX idx_ticket_created ON messages (ticket_id, created_at);
