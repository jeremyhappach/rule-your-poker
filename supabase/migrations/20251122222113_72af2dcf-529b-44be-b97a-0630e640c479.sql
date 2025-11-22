-- Add decision deadline to rounds
ALTER TABLE rounds ADD COLUMN decision_deadline timestamp with time zone;