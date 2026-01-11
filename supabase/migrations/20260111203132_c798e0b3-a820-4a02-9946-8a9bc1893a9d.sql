-- Create debug table for tracking sitting out status changes
CREATE TABLE public.sitting_out_debug_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  player_id UUID NOT NULL,
  user_id UUID NOT NULL,
  game_id UUID NOT NULL,
  username TEXT,
  is_bot BOOLEAN DEFAULT false,
  field_changed TEXT NOT NULL, -- 'sitting_out' or 'sit_out_next_hand'
  old_value BOOLEAN,
  new_value BOOLEAN,
  reason TEXT NOT NULL,
  source_location TEXT, -- file/function that triggered the change
  additional_context JSONB
);

-- Enable RLS
ALTER TABLE public.sitting_out_debug_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert
CREATE POLICY "Authenticated users can insert debug logs"
ON public.sitting_out_debug_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to read all logs (for debugging)
CREATE POLICY "Authenticated users can read debug logs"
ON public.sitting_out_debug_log
FOR SELECT
TO authenticated
USING (true);

-- Index for efficient queries
CREATE INDEX idx_sitting_out_debug_log_user_id ON public.sitting_out_debug_log(user_id);
CREATE INDEX idx_sitting_out_debug_log_game_id ON public.sitting_out_debug_log(game_id);
CREATE INDEX idx_sitting_out_debug_log_created_at ON public.sitting_out_debug_log(created_at DESC);