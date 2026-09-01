-- Project the synchronized 3-5-7 decision reveal from the immutable round
-- resolution identity. This is presentation metadata only: settlement,
-- balances, rules, and replay-safe continuation remain owned by the existing
-- resolver and recovery lease.

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

  -- Pause authority already shifts presentation_fallback_at. Deriving the
  -- ritual origin from that shifted deadline freezes/resumes this projection
  -- without adding a second pause owner.
  v_started_at := v_resolution.presentation_fallback_at -
    CASE WHEN v_resolution.outcome = 'terminal'
      THEN interval '30 seconds'
      ELSE interval '8 seconds'
    END;

  RETURN jsonb_build_object(
    'id', concat_ws(':', p_dealer_game_id::text, p_round_id::text),
    'game_id', p_game_id,
    'dealer_game_id', p_dealer_game_id,
    'round_id', p_round_id,
    'hand_number', p_hand_number,
    'round_number', p_round_number,
    'started_at', v_started_at,
    'drop_at', v_started_at + interval '1950 milliseconds',
    'ends_at', v_started_at + interval '3350 milliseconds',
    'continuation_at', v_started_at + interval '7350 milliseconds'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_decision_reveal(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;

DO $patch_current_frame$
DECLARE
  v_signature regprocedure := to_regprocedure('public.three_five_seven_current_frame(uuid)');
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'add_357_decision_reveal_projection:current_frame_missing';
  END IF;
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  v_old := E'    ''viewer_cards_present'', v_viewer_cards_present,\n    ''identity'', jsonb_build_object(';
  v_new := E'    ''viewer_cards_present'', v_viewer_cards_present,\n    ''decision_reveal'', private.three_five_seven_decision_reveal(\n      p_game_id, v_game.current_game_uuid, v_round.id,\n      v_game.total_hands, v_game.current_round\n    ),\n    ''server_now'', statement_timestamp(),\n    ''identity'', jsonb_build_object(';

  IF strpos(v_definition, v_new) = 0 THEN
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'add_357_decision_reveal_projection:current_frame_patch_target_mismatch';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END;
$patch_current_frame$;

DO $patch_submit_receipt$
DECLARE
  v_signature regprocedure := to_regprocedure(
    'public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text)'
  );
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'add_357_decision_reveal_projection:submit_decision_missing';
  END IF;
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF strpos(v_definition, '''decision_reveal'',private.three_five_seven_decision_reveal(') = 0 THEN
    -- The deduped return is nested one indentation level deeper than the
    -- ordinary committed return. Patch and shape-check each exact site.
    v_old := E'      ''game'',v_game_result,''round'',v_round_result\n    );';
    v_new := E'      ''game'',v_game_result,''round'',v_round_result,\n      ''decision_reveal'',private.three_five_seven_decision_reveal(\n        p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number\n      ),\n      ''server_now'',statement_timestamp()\n    );';
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'add_357_decision_reveal_projection:deduped_return_patch_target_mismatch';
    END IF;
    v_definition := replace(v_definition, v_old, v_new);

    v_old := E'    ''game'',v_game_result,''round'',v_round_result\n  );';
    v_new := E'    ''game'',v_game_result,''round'',v_round_result,\n    ''decision_reveal'',private.three_five_seven_decision_reveal(\n      p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number\n    ),\n    ''server_now'',statement_timestamp()\n  );';
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'add_357_decision_reveal_projection:committed_return_patch_target_mismatch';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END;
$patch_submit_receipt$;

COMMENT ON FUNCTION private.three_five_seven_decision_reveal(uuid,uuid,uuid,integer,integer) IS
  'Returns the pause-aware, immutable server-time 3-2-1-DROP projection for one exact resolved 3-5-7 round; owns no gameplay or progression state.';

COMMENT ON FUNCTION public.three_five_seven_current_frame(uuid) IS
  'Returns one exact MVCC 3-5-7 frame, including a server-timed decision reveal projection when the exact round is resolved; Realtime is refetch only.';

COMMENT ON FUNCTION public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text) IS
  'Commits an exact player decision and returns the committed frame receipt plus the same immutable server-timed reveal projection when the decision resolves the round.';
