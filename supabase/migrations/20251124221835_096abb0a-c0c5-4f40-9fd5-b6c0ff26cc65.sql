-- Add last_round_result to games table to display winner announcements
ALTER TABLE games ADD COLUMN last_round_result TEXT DEFAULT NULL;