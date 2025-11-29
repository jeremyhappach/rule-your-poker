-- Add pending_session_end flag to games table
ALTER TABLE public.games 
ADD COLUMN pending_session_end boolean DEFAULT false;