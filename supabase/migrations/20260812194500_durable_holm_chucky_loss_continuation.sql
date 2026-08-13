-- A completed Holm Chucky loss must not depend on a browser animation callback
-- to create its successor. Prepare the successor durably without publishing a
-- turn/deadline, then activate it after presentation. A service-only lease is
-- the recovery owner when every connected presentation callback is lost.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS holm_predecessor_round_id uuid
    REFERENCES public.rounds(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.rounds.holm_predecessor_round_id IS
  'Exact completed Holm round that durably prepared this non-actionable successor. NULL for ordinary/legacy rounds.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rounds_holm_predecessor_successor
  ON public.rounds (holm_predecessor_round_id)
  WHERE holm_predecessor_round_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prepare_next_holm_hand(
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
  v_round_id uuid;
  v_deck jsonb;
  v_community_cards jsonb;
  v_card_offset integer := 4;
  v_player_id uuid;
  v_inserted_count integer;
  v_fallback_at timestamptz;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:not_holm_game';
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1 FROM public.players participant
       WHERE participant.game_id = p_game_id
         AND participant.user_id = v_actor_id
         AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles profile
       WHERE profile.id = v_actor_id
         AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:not_participant';
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

  SELECT * INTO v_existing_round
  FROM public.rounds
  WHERE holm_predecessor_round_id = p_expected_round_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_existing_round.status = 'dealing' THEN 'already-prepared' ELSE 'already-active' END,
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'pending_turn_position', v_existing_round.pending_turn_position,
      'presentation_fallback_at', v_existing_round.presentation_fallback_at,
      'deduped', true
    );
  END IF;

  -- A successor published by the legacy continuation owner is still a
  -- replay-safe success. Never create a second next hand beside it.
  SELECT * INTO v_existing_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
    AND hand_number > coalesce(v_expected_round.hand_number, 0)
  ORDER BY hand_number, round_number
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-active',
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal-state', 'status', v_game.status);
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.awaiting_next_round, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'not-awaiting-next-hand');
  END IF;

  IF v_expected_round.status <> 'completed' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'predecessor-not-completed', 'status', v_expected_round.status);
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

  SELECT max(position) INTO v_new_buck_position
  FROM unnest(v_positions) AS occupied(position)
  WHERE position < v_game.buck_position;

  IF v_new_buck_position IS NULL THEN
    SELECT max(position) INTO v_new_buck_position
    FROM unnest(v_positions) AS occupied(position);
  END IF;

  v_hand_number := coalesce(v_expected_round.hand_number, 0) + 1;
  v_fallback_at := clock_timestamp() + interval '20 seconds';

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card,
           random() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824), chr(9829), chr(9830), chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;

  v_community_cards := jsonb_build_array(v_deck->0, v_deck->1, v_deck->2, v_deck->3);

  INSERT INTO public.rounds (
    game_id, round_number, cards_dealt, status, pot, decision_deadline,
    community_cards, community_cards_revealed, chucky_active,
    chucky_cards, chucky_cards_revealed, current_turn_position,
    pending_turn_position, presentation_generation, presentation_fallback_at,
    hand_number, dealer_game_id, holm_turn_sequence,
    holm_predecessor_round_id
  ) VALUES (
    p_game_id, 1, 4, 'dealing', coalesce(v_game.pot, 0), NULL,
    v_community_cards, 2, false,
    '[]'::jsonb, 0, NULL,
    v_new_buck_position, 0, v_fallback_at,
    v_hand_number, v_game.current_game_uuid, 0,
    p_expected_round_id
  ) RETURNING id INTO v_round_id;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    INSERT INTO public.player_cards (
      player_id, round_id, cards, hand_context_id, source_version, is_public
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

  SELECT count(*)::integer INTO v_inserted_count
  FROM public.player_cards
  WHERE round_id = v_round_id
    AND player_id = ANY(v_player_ids)
    AND hand_context_id = v_round_id::text;

  IF v_inserted_count <> v_player_count THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:card_cohort_changed';
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'prepared',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_hand_number,
    'pending_turn_position', v_new_buck_position,
    'pot', coalesce(v_game.pot, 0),
    'presentation_fallback_at', v_fallback_at,
    'deduped', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_prepared_holm_hand(
  p_game_id uuid,
  p_predecessor_round_id uuid,
  p_successor_round_id uuid,
  p_from_fallback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_predecessor public.rounds%ROWTYPE;
  v_successor public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_timer_seconds integer;
  v_deadline timestamptz;
  v_buck_event jsonb := NULL;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand:not_holm_game';
  END IF;

  IF p_from_fallback AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand:fallback_requires_service_role';
  END IF;

  IF NOT p_from_fallback
     AND NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1 FROM public.players participant
       WHERE participant.game_id = p_game_id
         AND participant.user_id = v_actor_id
         AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles profile
       WHERE profile.id = v_actor_id
         AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand:not_participant';
  END IF;

  SELECT * INTO v_predecessor
  FROM public.rounds
  WHERE id = p_predecessor_round_id
    AND game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  FOR UPDATE;

  SELECT * INTO v_successor
  FROM public.rounds
  WHERE id = p_successor_round_id
    AND game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
    AND holm_predecessor_round_id = p_predecessor_round_id
  FOR UPDATE;

  IF v_predecessor.id IS NULL OR v_successor.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-identity');
  END IF;

  IF v_successor.status = 'betting'
     AND NOT coalesce(v_game.awaiting_next_round, false)
     AND v_game.total_hands = v_successor.hand_number THEN
    RETURN jsonb_build_object(
      'outcome', 'already-active',
      'round_id', v_successor.id,
      'hand_number', v_successor.hand_number,
      'buck_position', v_successor.current_turn_position,
      'decision_deadline', v_successor.decision_deadline,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal-state', 'status', v_game.status);
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.awaiting_next_round, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'not-awaiting-next-hand');
  END IF;

  IF v_predecessor.status <> 'completed' OR v_successor.status <> 'dealing' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'invalid-round-status',
      'predecessor_status', v_predecessor.status,
      'successor_status', v_successor.status
    );
  END IF;

  IF p_from_fallback
     AND (v_successor.presentation_fallback_at IS NULL OR v_successor.presentation_fallback_at > clock_timestamp()) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'fallback-not-yet-due');
  END IF;

  IF v_successor.pending_turn_position IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'missing-pending-turn');
  END IF;

  SELECT coalesce(decision_timer_seconds, 30) INTO v_timer_seconds
  FROM public.game_defaults
  WHERE game_type = 'holm'
  LIMIT 1;
  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  IF v_game.buck_position IS NOT NULL
     AND v_game.buck_position IS DISTINCT FROM v_successor.pending_turn_position THEN
    v_buck_event := jsonb_build_object(
      'id', gen_random_uuid(),
      'sessionId', p_game_id,
      'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'fromPosition', v_game.buck_position,
      'toPosition', v_successor.pending_turn_position,
      'createdAt', clock_timestamp(),
      'source', 'SERVER_BUCK_TRANSFER'
    );
  END IF;

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
   WHERE id = p_predecessor_round_id;

  UPDATE public.rounds
     SET status = 'betting',
         current_turn_position = pending_turn_position,
         decision_deadline = v_deadline,
         pending_turn_position = NULL,
         presentation_fallback_at = NULL,
         presentation_generation = presentation_generation + 1
   WHERE id = p_successor_round_id
     AND status = 'dealing'
     AND pending_turn_position IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'activation-compare-and-set-failed');
  END IF;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = v_successor.hand_number,
         buck_position = v_successor.pending_turn_position,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         buck_transfer_presentation = coalesce(v_buck_event, buck_transfer_presentation)
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'activated',
    'round_id', p_successor_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_successor.hand_number,
    'buck_position', v_successor.pending_turn_position,
    'decision_deadline', v_deadline,
    'pot', coalesce(v_game.pot, 0),
    'from_fallback', p_from_fallback,
    'deduped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_next_holm_hand(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_next_holm_hand(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_next_holm_hand(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_next_holm_hand(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.prepare_next_holm_hand(uuid, uuid) IS
  'Replay-safe Holm successor preparation. Deals a non-actionable successor while preserving the completed predecessor presentation.';
COMMENT ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) IS
  'Exact prepared-successor activation. Connected presentation may activate early; service role may recover only after the durable presentation lease.';
