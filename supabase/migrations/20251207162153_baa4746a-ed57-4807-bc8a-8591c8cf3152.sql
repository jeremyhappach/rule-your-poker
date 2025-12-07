-- Add deck_color_mode column to players table for session-level preference
ALTER TABLE public.players 
ADD COLUMN deck_color_mode text DEFAULT NULL;

-- Enable realtime for this column change
ALTER TABLE public.players REPLICA IDENTITY FULL;