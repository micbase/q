-- Migration: image attachments on user replies
-- Image files live on disk under ATTACHMENTS_DIR/<ticket_id>/; this column holds only metadata:
-- [{ "id", "file", "media_type", "name", "size" }]
ALTER TABLE messages ADD COLUMN attachments JSONB;
