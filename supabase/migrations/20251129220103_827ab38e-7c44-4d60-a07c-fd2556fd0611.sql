-- Add 'game_selection' and 'session_ended' to the allowed game status values
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;

ALTER TABLE games ADD CONSTRAINT games_status_check 
CHECK (status IN ('waiting', 'dealer_selection', 'dealer_announcement', 'game_selection', 'configuring', 'ante_decision', 'in_progress', 'game_over', 'session_ended', 'completed'));