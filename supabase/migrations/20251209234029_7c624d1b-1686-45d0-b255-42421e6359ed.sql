-- Add config_deadline column to games table for server-side deadline enforcement
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS config_deadline TIMESTAMP WITH TIME ZONE DEFAULT NULL;