-- Add unique constraint for atomic deduplication of cribbage events
-- Uses COALESCE for nullable columns to ensure proper uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_cribbage_events_unique_event 
ON public.cribbage_events (
  round_id, 
  hand_number, 
  event_type, 
  COALESCE(event_subtype, ''), 
  player_id, 
  sequence_number
);