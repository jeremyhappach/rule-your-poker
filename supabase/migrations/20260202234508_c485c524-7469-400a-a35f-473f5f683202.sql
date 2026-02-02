-- Add cribbage_dealer_selection to the games status check constraint
-- This status is used for the high-card animation that determines the first dealer in cribbage

ALTER TABLE public.games DROP CONSTRAINT games_status_check;

ALTER TABLE public.games ADD CONSTRAINT games_status_check CHECK (
  status = ANY (ARRAY[
    'waiting'::text, 
    'dealer_selection'::text, 
    'dealer_announcement'::text, 
    'game_selection'::text, 
    'configuring'::text, 
    'ante_decision'::text, 
    'cribbage_dealer_selection'::text,  -- NEW: Cribbage high-card dealer selection
    'in_progress'::text, 
    'game_over'::text, 
    'session_ended'::text, 
    'completed'::text
  ])
);