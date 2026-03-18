-- Migration: add db_credential to projects (auto-provisioned dev postgres DB per project)
ALTER TABLE projects ADD COLUMN db_credential JSONB;
