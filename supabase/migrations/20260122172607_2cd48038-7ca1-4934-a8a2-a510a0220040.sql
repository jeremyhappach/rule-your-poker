-- Create temporary dice roll audit table
CREATE TABLE public.dice_roll_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  die_index smallint NOT NULL CHECK (die_index >= 0 AND die_index <= 4),
  die_value smallint NOT NULL CHECK (die_value >= 1 AND die_value <= 6),
  roll_number smallint NOT NULL CHECK (roll_number >= 1 AND roll_number <= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX idx_dice_roll_audit_created ON public.dice_roll_audit(created_at DESC);
CREATE INDEX idx_dice_roll_audit_game ON public.dice_roll_audit(game_id);

-- Enable RLS
ALTER TABLE public.dice_roll_audit ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert (for logging rolls)
CREATE POLICY "Users can insert dice rolls" 
ON public.dice_roll_audit 
FOR INSERT 
WITH CHECK (true);

-- Allow admins to read all rolls for analysis
CREATE POLICY "Admins can read all rolls" 
ON public.dice_roll_audit 
FOR SELECT 
USING (public.is_admin(auth.uid()));

-- Add to realtime for debugging if needed
ALTER PUBLICATION supabase_realtime ADD TABLE public.dice_roll_audit;