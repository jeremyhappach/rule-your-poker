-- Drop the foreign key constraint on cribbage_events.player_id
-- This allows event logging to succeed even when a player row is deleted/recreated
-- (e.g., when a player leaves and rejoins a session, getting a new players.id).
-- The cribbage_events table is an audit trail and should not be coupled to player lifecycle.
ALTER TABLE public.cribbage_events DROP CONSTRAINT cribbage_events_player_id_fkey;