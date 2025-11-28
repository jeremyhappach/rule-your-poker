-- Update the status check constraint to include new statuses
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;

ALTER TABLE public.games ADD CONSTRAINT games_status_check 
CHECK (status IN ('waiting', 'configuring', 'ante_decision', 'in_progress', 'completed'));