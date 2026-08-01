DROP INDEX IF EXISTS public.session_player_snapshots_dealer_hand_participant_key;

CREATE UNIQUE INDEX IF NOT EXISTS session_player_snapshots_dealer_hand_participant_key
  ON public.session_player_snapshots (game_id, dealer_game_id, hand_number, player_id);