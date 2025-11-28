-- Update the status check constraint to include dealer_selection status
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;

ALTER TABLE public.games ADD CONSTRAINT games_status_check 
CHECK (status IN ('waiting', 'dealer_selection', 'configuring', 'ante_decision', 'in_progress', 'completed'));