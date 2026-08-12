-- Holm decisions, turn advancement, deadlines, and successor-hand publication
-- must each cross one authoritative transaction boundary.  The previously
-- deployed three-argument decision function retains the already-proven
-- settlement implementation, but is moved behind an exact-round/current-turn
-- gate so no browser or deadline worker can write the next turn separately.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS holm_turn_sequence integer NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF to_regprocedure('public.holm_submit_decision_core(uuid,uuid,text)') IS NULL THEN
    IF to_regprocedure('public.holm_submit_decision(uuid,uuid,text)') IS NULL THEN
      RAISE EXCEPTION 'atomic_holm_turn:missing_existing_decision_function';
    END IF;

    ALTER FUNCTION public.holm_submit_decision(uuid, uuid, text)
      RENAME TO holm_submit_decision_core;
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.holm_submit_decision_core(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.holm_submit_decision_core(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.holm_submit_decision_core(uuid, uuid, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.holm_submit_decision(
  p_game_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_latest_round_id uuid;
  v_result jsonb;
  v_next_turn_position integer;
  v_timer_seconds integer;
  v_next_deadline timestamptz;
  v_turn_sequence integer;
BEGIN
  IF p_decision NOT IN ('stay', 'fold') THEN
    RAISE EXCEPTION 'holm_submit_decision:invalid_decision';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'holm_submit_decision:authentication_required';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_submit_decision:not_holm_game';
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object(
      'already_terminal', true,
      'status', v_game.status,
      'round_id', p_round_id
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('game_paused', true, 'round_id', p_round_id);
  END IF;

  SELECT id
    INTO v_latest_round_id
    FROM public.rounds
   WHERE game_id = p_game_id
     AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
   ORDER BY hand_number DESC NULLS LAST, round_number DESC NULLS LAST
   LIMIT 1;

  IF v_latest_round_id IS NULL OR v_latest_round_id IS DISTINCT FROM p_round_id THEN
    RETURN jsonb_build_object(
      'stale_round', true,
      'round_id', p_round_id,
      'current_round_id', v_latest_round_id
    );
  END IF;

  SELECT *
    INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
     AND game_id = p_game_id
     AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stale_round', true, 'round_id', p_round_id);
  END IF;

  IF v_round.status <> 'betting' THEN
    RETURN jsonb_build_object(
      'round_not_betting', true,
      'round_status', v_round.status,
      'round_id', v_round.id,
      'turn_sequence', v_round.holm_turn_sequence
    );
  END IF;

  SELECT *
    INTO v_player
    FROM public.players
   WHERE id = p_player_id
     AND game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'holm_submit_decision:player_mismatch';
  END IF;

  IF v_player.status <> 'active' OR coalesce(v_player.sitting_out, false) THEN
    RETURN jsonb_build_object(
      'player_not_eligible', true,
      'round_id', v_round.id,
      'player_id', p_player_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.players participant
     WHERE participant.game_id = p_game_id
       AND participant.user_id = auth.uid()
       AND participant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'holm_submit_decision:not_participant';
  END IF;

  IF v_player.user_id IS DISTINCT FROM auth.uid()
     AND NOT coalesce(v_player.is_bot, false) THEN
    RAISE EXCEPTION 'holm_submit_decision:not_player_owner';
  END IF;

  -- A replay remains inert even after the pointer has moved away from this
  -- player.  This check intentionally precedes the current-turn rejection.
  IF v_player.decision_locked THEN
    RETURN jsonb_build_object(
      'already_locked', true,
      'all_decisions_in', v_game.all_decisions_in,
      'status', v_game.status,
      'round_id', v_round.id,
      'turn_sequence', v_round.holm_turn_sequence,
      'current_turn_position', v_round.current_turn_position,
      'decision_deadline', v_round.decision_deadline
    );
  END IF;

  IF v_player.position IS DISTINCT FROM v_round.current_turn_position THEN
    RETURN jsonb_build_object(
      'not_current_turn', true,
      'round_id', v_round.id,
      'player_id', p_player_id,
      'player_position', v_player.position,
      'current_turn_position', v_round.current_turn_position,
      'turn_sequence', v_round.holm_turn_sequence
    );
  END IF;

  -- This call executes inside this transaction and preserves the established,
  -- replay-safe all-fold / solo-vs-Chucky settlement implementation.
  SELECT public.holm_submit_decision_core(p_game_id, p_player_id, p_decision)
    INTO v_result;

  IF coalesce((v_result->>'already_locked')::boolean, false)
     OR coalesce((v_result->>'already_terminal')::boolean, false)
     OR coalesce((v_result->>'round_not_betting')::boolean, false) THEN
    RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'round_id', v_round.id,
      'turn_sequence', v_round.holm_turn_sequence
    );
  END IF;

  IF coalesce((v_result->>'all_decisions_in')::boolean, false) THEN
    UPDATE public.rounds
       SET current_turn_position = NULL,
           decision_deadline = NULL,
           holm_turn_sequence = holm_turn_sequence + 1
     WHERE id = v_round.id
     RETURNING holm_turn_sequence INTO v_turn_sequence;

    RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'round_id', v_round.id,
      'turn_sequence', v_turn_sequence,
      'current_turn_position', NULL,
      'decision_deadline', NULL
    );
  END IF;

  -- Canonical poker-clockwise order is the nearest lower occupied position,
  -- wrapping from the lowest seat to the highest.
  SELECT position
    INTO v_next_turn_position
    FROM public.players
   WHERE game_id = p_game_id
     AND status = 'active'
     AND sitting_out = false
     AND decision_locked = false
   ORDER BY
     CASE WHEN position < v_player.position THEN 0 ELSE 1 END,
     position DESC
   LIMIT 1;

  IF v_next_turn_position IS NULL THEN
    RAISE EXCEPTION 'holm_submit_decision:missing_next_turn';
  END IF;

  SELECT coalesce(decision_timer_seconds, 30)
    INTO v_timer_seconds
    FROM public.game_defaults
   WHERE game_type = 'holm'
   LIMIT 1;

  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_next_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  UPDATE public.rounds
     SET current_turn_position = v_next_turn_position,
         decision_deadline = v_next_deadline,
         holm_turn_sequence = holm_turn_sequence + 1
   WHERE id = v_round.id
     AND status = 'betting'
     AND current_turn_position = v_player.position
   RETURNING holm_turn_sequence INTO v_turn_sequence;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'holm_submit_decision:turn_compare_and_set_failed';
  END IF;

  RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'round_id', v_round.id,
    'turn_sequence', v_turn_sequence,
    'current_turn_position', v_next_turn_position,
    'decision_deadline', v_next_deadline
  );
END;
$$;

-- Compatibility for an already-open pre-release browser.  It receives the
-- same current-turn and atomic-advance protections, but cannot provide the
-- stronger stale-hand proof available to the four-argument client.
CREATE OR REPLACE FUNCTION public.holm_submit_decision(
  p_game_id uuid,
  p_player_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round_id uuid;
  v_result jsonb;
BEGIN
  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_submit_decision:not_holm_game';
  END IF;

  SELECT id INTO v_round_id
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  ORDER BY hand_number DESC NULLS LAST, round_number DESC NULLS LAST
  LIMIT 1;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('round_not_betting', true, 'round_status', NULL);
  END IF;

  SELECT public.holm_submit_decision(p_game_id, v_round_id, p_player_id, p_decision)
    INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object('compatibility_inferred_round', true);
END;
$$;

REVOKE ALL ON FUNCTION public.holm_submit_decision(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.holm_submit_decision(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.holm_submit_decision(uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.holm_submit_decision(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.holm_submit_decision(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.holm_submit_decision(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.holm_submit_decision(uuid, uuid, uuid, text) IS
  'Exact-round Holm action owner. Locks the decision, advances the turn/deadline, and enters terminal settlement in one transaction.';

CREATE OR REPLACE FUNCTION public.holm_apply_deadline_decision(
  p_game_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_decision text,
  p_mark_auto_fold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_decision NOT IN ('stay', 'fold') THEN
    RAISE EXCEPTION 'holm_apply_deadline_decision:invalid_decision';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_apply_deadline_decision:not_holm_game';
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('already_terminal', true, 'status', v_game.status);
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('game_paused', true, 'round_id', p_round_id);
  END IF;

  SELECT * INTO v_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  ORDER BY hand_number DESC NULLS LAST, round_number DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_round.id IS DISTINCT FROM p_round_id THEN
    RETURN jsonb_build_object('stale_round', true);
  END IF;

  IF v_round.status <> 'betting' THEN
    RETURN jsonb_build_object('round_not_betting', true, 'round_status', v_round.status);
  END IF;

  IF v_round.decision_deadline IS NULL OR v_round.decision_deadline > now() THEN
    RETURN jsonb_build_object('deadline_not_expired', true);
  END IF;

  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id
    AND game_id = p_game_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_player.status <> 'active'
     OR coalesce(v_player.sitting_out, false) THEN
    RETURN jsonb_build_object('player_not_eligible', true);
  END IF;

  IF v_player.position IS DISTINCT FROM v_round.current_turn_position THEN
    RETURN jsonb_build_object('not_current_turn', true);
  END IF;

  IF v_player.decision_locked THEN
    RETURN jsonb_build_object('already_locked', true);
  END IF;

  IF v_player.user_id IS NULL THEN
    RETURN jsonb_build_object('deadline_actor_unavailable', true);
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_player.user_id::text, true);

  SELECT public.holm_submit_decision(
    p_game_id,
    p_round_id,
    p_player_id,
    p_decision
  ) INTO v_result;

  IF p_mark_auto_fold
     AND p_decision = 'fold'
     AND coalesce((v_result->>'decision_locked')::boolean, false) THEN
    UPDATE public.players
       SET auto_fold = true,
           sit_out_next_hand = true
     WHERE id = p_player_id
       AND game_id = p_game_id;
  END IF;

  RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'deadline_applied', true,
    'round_id', v_round.id,
    'player_id', p_player_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) IS
  'Service-only expired-turn adapter. Uses the same exact-round atomic decision/turn/settlement owner as a live action.';

CREATE OR REPLACE FUNCTION public.proceed_to_next_holm_hand(
  p_game_id uuid,
  p_expected_round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_expected_round public.rounds%ROWTYPE;
  v_existing_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player_ids uuid[];
  v_positions integer[];
  v_player_count integer;
  v_new_buck_position integer;
  v_hand_number integer;
  v_timer_seconds integer;
  v_deadline timestamptz;
  v_round_id uuid;
  v_deck jsonb;
  v_community_cards jsonb;
  v_card_offset integer := 4;
  v_player_id uuid;
  v_updated_count integer;
  v_buck_event jsonb := NULL;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:not_holm_game';
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1
       FROM public.players participant
       WHERE participant.game_id = p_game_id
         AND participant.user_id = v_actor_id
         AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles profile
       WHERE profile.id = v_actor_id
         AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:not_participant';
  END IF;

  SELECT * INTO v_expected_round
  FROM public.rounds
  WHERE id = p_expected_round_id
    AND game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-round');
  END IF;

  -- Duplicate or late callbacks receive the immutable successor identity.
  SELECT * INTO v_existing_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
    AND hand_number > coalesce(v_expected_round.hand_number, 0)
  ORDER BY hand_number, round_number
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-started',
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'buck_position', v_existing_round.current_turn_position,
      'pot', v_existing_round.pot,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'terminal-state',
      'status', v_game.status
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.awaiting_next_round, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'not-awaiting-next-hand');
  END IF;

  SELECT array_agg(id ORDER BY position),
         array_agg(position ORDER BY position),
         count(*)::integer
    INTO v_player_ids, v_positions, v_player_count
    FROM public.players
   WHERE game_id = p_game_id
     AND status = 'active'
     AND sitting_out = false;

  IF coalesce(v_player_count, 0) < 1 THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'no-active-players');
  END IF;

  IF 4 + (4 * v_player_count) > 52 THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'too-many-players');
  END IF;

  SELECT max(position)
    INTO v_new_buck_position
    FROM unnest(v_positions) AS occupied(position)
   WHERE position < v_game.buck_position;

  IF v_new_buck_position IS NULL THEN
    SELECT max(position)
      INTO v_new_buck_position
      FROM unnest(v_positions) AS occupied(position);
  END IF;

  v_hand_number := coalesce(v_expected_round.hand_number, 0) + 1;

  SELECT coalesce(decision_timer_seconds, 30)
    INTO v_timer_seconds
    FROM public.game_defaults
   WHERE game_type = 'holm'
   LIMIT 1;

  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card,
           random() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824), chr(9829), chr(9830), chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key)
    INTO v_deck
    FROM deck;

  v_community_cards := jsonb_build_array(
    v_deck->0,
    v_deck->1,
    v_deck->2,
    v_deck->3
  );

  UPDATE public.players
     SET current_decision = NULL,
         decision_locked = false,
         pre_fold = false,
         pre_stay = false
   WHERE game_id = p_game_id;

  UPDATE public.rounds
     SET status = 'completed',
         current_turn_position = NULL,
         decision_deadline = NULL
   WHERE id = v_expected_round.id;

  INSERT INTO public.rounds (
    game_id,
    round_number,
    cards_dealt,
    status,
    pot,
    decision_deadline,
    community_cards,
    community_cards_revealed,
    chucky_active,
    chucky_cards,
    chucky_cards_revealed,
    current_turn_position,
    hand_number,
    dealer_game_id,
    holm_turn_sequence
  ) VALUES (
    p_game_id,
    1,
    4,
    'betting',
    coalesce(v_game.pot, 0),
    v_deadline,
    v_community_cards,
    2,
    false,
    '[]'::jsonb,
    0,
    v_new_buck_position,
    v_hand_number,
    v_game.current_game_uuid,
    0
  )
  RETURNING id INTO v_round_id;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    INSERT INTO public.player_cards (
      player_id,
      round_id,
      cards,
      hand_context_id,
      source_version,
      is_public
    ) VALUES (
      v_player_id,
      v_round_id,
      jsonb_build_array(
        v_deck->v_card_offset,
        v_deck->(v_card_offset + 1),
        v_deck->(v_card_offset + 2),
        v_deck->(v_card_offset + 3)
      ),
      v_round_id::text,
      1,
      false
    );
    v_card_offset := v_card_offset + 4;
  END LOOP;

  SELECT count(*)::integer
    INTO v_updated_count
    FROM public.player_cards
   WHERE round_id = v_round_id
     AND player_id = ANY(v_player_ids)
     AND hand_context_id = v_round_id::text;

  IF v_updated_count <> v_player_count THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:card_cohort_changed';
  END IF;

  IF v_game.buck_position IS NOT NULL
     AND v_game.buck_position IS DISTINCT FROM v_new_buck_position THEN
    v_buck_event := jsonb_build_object(
      'id', gen_random_uuid(),
      'sessionId', p_game_id,
      'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'fromPosition', v_game.buck_position,
      'toPosition', v_new_buck_position,
      'createdAt', clock_timestamp(),
      'source', 'SERVER_BUCK_TRANSFER'
    );
  END IF;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = v_hand_number,
         buck_position = v_new_buck_position,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         buck_transfer_presentation = coalesce(v_buck_event, buck_transfer_presentation)
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'started',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_hand_number,
    'buck_position', v_new_buck_position,
    'pot', coalesce(v_game.pot, 0),
    'deduped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) IS
  'Replay-safe Holm successor-hand owner. Resets decisions, completes the predecessor, deals cards, and publishes game pointers atomically.';
