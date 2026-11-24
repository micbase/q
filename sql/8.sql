-- Migration: image attachments on user replies
-- Image bytes live in `attachments`; messages.attachments holds lightweight metadata
-- ([{id, media_type, name, size}]) so message replay/SSE never carries the image data.
CREATE TABLE IF NOT EXISTS attachments (
  id           VARCHAR(21)      NOT NULL PRIMARY KEY,
  ticket_id    VARCHAR(21)      NOT NULL,
  media_type   VARCHAR(64)      NOT NULL,
  name         VARCHAR(255),
  size         INTEGER          NOT NULL,
  data         BYTEA            NOT NULL,
  created_at   BIGINT           NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments (ticket_id);

ALTER TABLE messages ADD COLUMN attachments JSONB;
