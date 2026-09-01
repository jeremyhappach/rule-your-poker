-- Keep the decision-reveal schedule server-authored while adding a short
-- sealed lead-in and a slightly slower 3-2-1 cadence. This projection owns
-- no settlement, balances, or continuation state.

CREATE OR REPLACE FUNCTION private.three_five_seven_decision_reveal(
  p_game_id uuid,
  p_dealer_game_id uuid,
  p_round_id uuid,
  p_hand_number integer,
  p_round_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_started_at timestamptz;
  v_countdown_at timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_game_id IS NULL OR p_round_id IS NULL
     OR p_hand_number IS NULL OR p_round_number IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_resolution
    FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id = p_game_id
     AND resolution.dealer_game_id = p_dealer_game_id
     AND resolution.round_id = p_round_id
     AND resolution.hand_number = p_hand_number
     AND resolution.round_number = p_round_number;

  IF NOT FOUND OR v_resolution.outcome = 'instant_sweep' THEN
    RETURN NULL;
  END IF;

  -- presentation_fallback_at remains the single pause-aware clock origin.
  v_started_at := v_resolution.presentation_fallback_at -
    CASE WHEN v_resolution.outcome = 'terminal'
      THEN interval '30 seconds'
      ELSE interval '8 seconds'
    END;
  v_countdown_at := v_started_at + interval '400 milliseconds';

  RETURN jsonb_build_object(
    'id', concat_ws(':', p_dealer_game_id::text, p_round_id::text),
    'game_id', p_game_id,
    'dealer_game_id', p_dealer_game_id,
    'round_id', p_round_id,
    'hand_number', p_hand_number,
    'round_number', p_round_number,
    'started_at', v_started_at,
    'countdown_at', v_countdown_at,
    'drop_at', v_countdown_at + interval '2100 milliseconds',
    'ends_at', v_countdown_at + interval '3500 milliseconds',
    'continuation_at', v_started_at + interval '7350 milliseconds'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_decision_reveal(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.three_five_seven_decision_reveal(uuid,uuid,uuid,integer,integer) IS
  'Returns the pause-aware immutable server-time sealed-lead-in, 3-2-1-DROP projection for one exact resolved 3-5-7 round; owns no gameplay or progression state.';
