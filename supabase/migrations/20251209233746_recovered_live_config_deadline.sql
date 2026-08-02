-- Add config_deadline field to games table for dealer configuration timeout
-- This allows any connected client to check if the dealer has timed out
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS config_deadline timestamp with time zone DEFAULT NULL;
