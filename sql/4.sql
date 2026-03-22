-- Migration: add 'archived' to ticket_status (ticket branch merged into main)
ALTER TYPE ticket_status ADD VALUE 'archived';
