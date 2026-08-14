-- Holm continuation is event-driven for connected humans. Settlement still
-- prepares exactly one non-actionable successor, but normal activation waits
-- for every latched human participant to acknowledge that the successor deal
-- reached DealRuntime's canonical ready boundary. A configurable database
-- lease remains the only recovery path when an acknowledgement never arrives.

ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS holm_presentation_ack_fallback_seconds integer NOT NULL DEFAULT 30;

UPDATE public.game_defaults
SET holm_presentation_ack_fallback_seconds = 30
WHERE game_type = 'holm'
  AND holm_presentation_ack_fallback_seconds IS NULL;

ALTER TABLE public.game_defaults
  DROP CONSTRAINT IF EXISTS game_defaults_holm_presentation_ack_fallback_seconds_check;
ALTER TABLE public.game_defaults
  ADD CONSTRAINT game_defaults_holm_presentation_ack_fallback_seconds_check
  CHECK (holm_presentation_ack_fallback_seconds BETWEEN 5 AND 300);

CREATE TABLE IF NOT EXISTS private.holm_hand_presentation_ack_requirements (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL,
  predecessor_round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  successor_round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL CHECK (hand_number > 0),
  player_id uuid NOT NULL,
  user_id uuid NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (successor_round_id, player_id),
  UNIQUE (successor_round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_holm_hand_presentation_ack_unacknowledged
  ON private.holm_hand_presentation_ack_requirements (successor_round_id)
  WHERE acknowledged_at IS NULL;

ALTER TABLE private.holm_hand_presentation_ack_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.holm_hand_presentation_ack_requirements FROM PUBLIC, anon, authenticated;

-- Preserve any in-flight prepared production hand across this cutover. New
-- preparations insert their immutable cohort in prepare_next_holm_hand below.
INSERT INTO private.holm_hand_presentation_ack_requirements (
  game_id, dealer_game_id, predecessor_round_id, successor_round_id,
  hand_number, player_id, user_id
)
SELECT successor.game_id,
       successor.dealer_game_id,
       successor.holm_predecessor_round_id,
       successor.id,
       successor.hand_number,
       participant.id,
       participant.user_id
FROM public.rounds successor
JOIN public.games game_row ON game_row.id = successor.game_id
JOIN public.players participant ON participant.game_id = successor.game_id
WHERE successor.status = 'dealing'
  AND successor.holm_predecessor_round_id IS NOT NULL
  AND successor.dealer_game_id IS NOT NULL
  AND successor.hand_number IS NOT NULL
  AND game_row.game_type IN ('holm', 'holm-game')
  AND participant.status = 'active'
  AND participant.sitting_out = false
  AND participant.is_bot = false
ON CONFLICT (successor_round_id, player_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prepare_next_holm_hand(
  p_game_id uuid,
  p_expected_round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
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
  v_fallback_seconds integer;
  v_fallback_at timestamptz;
  v_buck_event jsonb := NULL;
  v_ack_required integer := 0;
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
    SELECT count(*)::integer INTO v_ack_required
    FROM private.holm_hand_presentation_ack_requirements requirement
    WHERE requirement.successor_round_id = v_existing_round.id;
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_existing_round.status = 'dealing' THEN 'already-prepared' ELSE 'already-active' END,
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'pending_turn_position', v_existing_round.pending_turn_position,
      'presentation_fallback_at', v_existing_round.presentation_fallback_at,
      'acknowledgements_required', v_ack_required,
      'deduped', true
    );
  END IF;

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
  SELECT holm_presentation_ack_fallback_seconds INTO v_fallback_seconds
  FROM public.game_defaults
  WHERE game_type = 'holm'
  LIMIT 1;
  v_fallback_seconds := coalesce(v_fallback_seconds, 30);
  v_fallback_at := clock_timestamp() + make_interval(secs => v_fallback_seconds);

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

  INSERT INTO private.holm_hand_presentation_ack_requirements (
    game_id, dealer_game_id, predecessor_round_id, successor_round_id,
    hand_number, player_id, user_id
  )
  SELECT p_game_id,
         v_game.current_game_uuid,
         p_expected_round_id,
         v_round_id,
         v_hand_number,
         participant.id,
         participant.user_id
  FROM public.players participant
  WHERE participant.game_id = p_game_id
    AND participant.status = 'active'
    AND participant.sitting_out = false
    AND participant.is_bot = false;
  GET DIAGNOSTICS v_ack_required = ROW_COUNT;

  IF v_game.buck_position IS NOT NULL
     AND v_game.buck_position IS DISTINCT FROM v_new_buck_position THEN
    v_buck_event := jsonb_build_object(
      'id', gen_random_uuid(),
      'sessionId', p_game_id,
      'dealerGameId', v_game.current_game_uuid,
      'roundId', v_round_id,
      'handContextId', v_round_id::text,
      'handNumber', v_hand_number,
      'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'fromPosition', v_game.buck_position,
      'toPosition', v_new_buck_position,
      'createdAt', clock_timestamp(),
      'source', 'SERVER_BUCK_TRANSFER'
    );
  END IF;

  -- The exact H2 Buck event is durable before clients are allowed to present
  -- H2. Exact round/hand admission prevents it from appearing on H1.
  UPDATE public.games
     SET buck_transfer_presentation = v_buck_event
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'prepared',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_hand_number,
    'pending_turn_position', v_new_buck_position,
    'pot', coalesce(v_game.pot, 0),
    'presentation_fallback_at', v_fallback_at,
    'acknowledgements_required', v_ack_required,
    'deduped', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.activate_prepared_holm_hand_exact(
  p_game_id uuid,
  p_predecessor_round_id uuid,
  p_successor_round_id uuid,
  p_release_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_predecessor public.rounds%ROWTYPE;
  v_successor public.rounds%ROWTYPE;
  v_timer_seconds integer;
  v_deadline timestamptz;
  v_next_buck_position integer;
  v_buck_event jsonb;
BEGIN
  IF p_release_mode NOT IN ('acknowledged', 'fallback') THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand_exact:invalid_release_mode';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand_exact:not_holm_game';
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
      'dealer_game_id', v_successor.dealer_game_id,
      'hand_number', v_successor.hand_number,
      'buck_position', v_successor.current_turn_position,
      'decision_deadline', v_successor.decision_deadline,
      'from_fallback', p_release_mode = 'fallback',
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

  IF p_release_mode = 'acknowledged' AND EXISTS (
    SELECT 1
    FROM private.holm_hand_presentation_ack_requirements requirement
    WHERE requirement.successor_round_id = p_successor_round_id
      AND requirement.acknowledged_at IS NULL
  ) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'acknowledgements-pending');
  END IF;

  IF p_release_mode = 'fallback'
     AND (
       v_successor.presentation_fallback_at IS NULL
       OR v_successor.presentation_fallback_at > clock_timestamp()
     ) THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'presentation-fallback-not-due',
      'presentation_fallback_at', v_successor.presentation_fallback_at
    );
  END IF;

  IF v_successor.pending_turn_position IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'missing-pending-turn');
  END IF;

  v_next_buck_position := v_successor.pending_turn_position;
  SELECT coalesce(decision_timer_seconds, 30) INTO v_timer_seconds
  FROM public.game_defaults
  WHERE game_type = 'holm'
  LIMIT 1;
  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  v_buck_event := v_game.buck_transfer_presentation;
  IF v_game.buck_position IS NOT NULL
     AND v_game.buck_position IS DISTINCT FROM v_next_buck_position
     AND (
       v_buck_event IS NULL
       OR v_buck_event->>'roundId' IS DISTINCT FROM p_successor_round_id::text
     ) THEN
    v_buck_event := jsonb_build_object(
      'id', gen_random_uuid(),
      'sessionId', p_game_id,
      'dealerGameId', v_successor.dealer_game_id,
      'roundId', v_successor.id,
      'handContextId', v_successor.id::text,
      'handNumber', v_successor.hand_number,
      'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'fromPosition', v_game.buck_position,
      'toPosition', v_next_buck_position,
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
         buck_position = v_next_buck_position,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         buck_transfer_presentation = v_buck_event
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'activated',
    'round_id', p_successor_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_successor.hand_number,
    'buck_position', v_next_buck_position,
    'decision_deadline', v_deadline,
    'pot', coalesce(v_game.pot, 0),
    'from_fallback', p_release_mode = 'fallback',
    'deduped', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_holm_prepared_hand_dealt(
  p_game_id uuid,
  p_dealer_game_id uuid,
  p_predecessor_round_id uuid,
  p_successor_round_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_game public.games%ROWTYPE;
  v_predecessor public.rounds%ROWTYPE;
  v_successor public.rounds%ROWTYPE;
  v_requirement private.holm_hand_presentation_ack_requirements%ROWTYPE;
  v_pending integer;
  v_result jsonb;
  v_was_acknowledged boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'acknowledge_holm_prepared_hand_dealt:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'acknowledge_holm_prepared_hand_dealt:not_holm_game';
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-dealer-game');
  END IF;

  SELECT * INTO v_predecessor
  FROM public.rounds
  WHERE id = p_predecessor_round_id
    AND game_id = p_game_id
    AND dealer_game_id = p_dealer_game_id
  FOR UPDATE;

  SELECT * INTO v_successor
  FROM public.rounds
  WHERE id = p_successor_round_id
    AND game_id = p_game_id
    AND dealer_game_id = p_dealer_game_id
    AND holm_predecessor_round_id = p_predecessor_round_id
    AND hand_number = p_hand_number
  FOR UPDATE;

  IF v_predecessor.id IS NULL OR v_successor.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-hand-identity');
  END IF;

  SELECT * INTO v_requirement
  FROM private.holm_hand_presentation_ack_requirements requirement
  WHERE requirement.game_id = p_game_id
    AND requirement.dealer_game_id = p_dealer_game_id
    AND requirement.predecessor_round_id = p_predecessor_round_id
    AND requirement.successor_round_id = p_successor_round_id
    AND requirement.hand_number = p_hand_number
    AND requirement.user_id = v_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'acknowledgement-not-required-for-caller');
  END IF;

  IF v_successor.status = 'betting'
     AND NOT coalesce(v_game.awaiting_next_round, false)
     AND v_game.total_hands = v_successor.hand_number THEN
    RETURN jsonb_build_object(
      'outcome', 'already-active',
      'round_id', v_successor.id,
      'dealer_game_id', v_successor.dealer_game_id,
      'hand_number', v_successor.hand_number,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal-state');
  END IF;

  IF NOT coalesce(v_game.awaiting_next_round, false)
     OR v_predecessor.status <> 'completed'
     OR v_successor.status <> 'dealing' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'hand-not-awaiting-acknowledgements');
  END IF;

  v_was_acknowledged := v_requirement.acknowledged_at IS NOT NULL;
  UPDATE private.holm_hand_presentation_ack_requirements
     SET acknowledged_at = coalesce(acknowledged_at, clock_timestamp())
   WHERE successor_round_id = p_successor_round_id
     AND player_id = v_requirement.player_id;

  SELECT count(*)::integer INTO v_pending
  FROM private.holm_hand_presentation_ack_requirements requirement
  WHERE requirement.successor_round_id = p_successor_round_id
    AND requirement.acknowledged_at IS NULL;

  IF v_pending > 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'acknowledged-waiting',
      'round_id', p_successor_round_id,
      'hand_number', p_hand_number,
      'pending_acknowledgements', v_pending,
      'deduped', v_was_acknowledged
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object(
      'outcome', 'acknowledged-paused',
      'round_id', p_successor_round_id,
      'hand_number', p_hand_number,
      'pending_acknowledgements', 0,
      'deduped', v_was_acknowledged
    );
  END IF;

  SELECT private.activate_prepared_holm_hand_exact(
    p_game_id,
    p_predecessor_round_id,
    p_successor_round_id,
    'acknowledged'
  ) INTO v_result;

  RETURN v_result || jsonb_build_object(
    'acknowledged', true,
    'pending_acknowledgements', 0,
    'deduped_acknowledgement', v_was_acknowledged
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
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_holm_hand:server_only';
  END IF;
  IF NOT p_from_fallback THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'fallback-release-required');
  END IF;
  RETURN private.activate_prepared_holm_hand_exact(
    p_game_id,
    p_predecessor_round_id,
    p_successor_round_id,
    'fallback'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.proceed_to_next_holm_hand(
  p_game_id uuid,
  p_expected_round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_prepared public.rounds%ROWTYPE;
BEGIN
  IF NOT v_is_service_role THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:server_only';
  END IF;
  SELECT * INTO v_prepared
  FROM public.rounds
  WHERE game_id = p_game_id
    AND holm_predecessor_round_id = p_expected_round_id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'missing-prepared-successor');
  END IF;
  RETURN public.activate_prepared_holm_hand(
    p_game_id,
    p_expected_round_id,
    v_prepared.id,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.release_due_holm_presentations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_due record;
  v_result jsonb;
  v_released integer := 0;
  v_release_mode text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('private.release_due_holm_presentations', 0)) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  FOR v_due IN
    SELECT successor.game_id,
           successor.holm_predecessor_round_id AS predecessor_round_id,
           successor.id AS successor_round_id,
           NOT EXISTS (
             SELECT 1
             FROM private.holm_hand_presentation_ack_requirements requirement
             WHERE requirement.successor_round_id = successor.id
               AND requirement.acknowledged_at IS NULL
           ) AS acknowledgements_complete,
           successor.presentation_fallback_at <= clock_timestamp() AS fallback_due
      FROM public.rounds successor
      JOIN public.games game_row ON game_row.id = successor.game_id
     WHERE successor.status = 'dealing'
       AND successor.holm_predecessor_round_id IS NOT NULL
       AND successor.presentation_fallback_at IS NOT NULL
       AND (
         successor.presentation_fallback_at <= clock_timestamp()
         OR NOT EXISTS (
           SELECT 1
           FROM private.holm_hand_presentation_ack_requirements requirement
           WHERE requirement.successor_round_id = successor.id
             AND requirement.acknowledged_at IS NULL
         )
       )
       AND game_row.game_type IN ('holm', 'holm-game')
       AND game_row.awaiting_next_round = true
       AND game_row.status NOT IN ('game_over', 'session_ended')
       AND coalesce(game_row.is_paused, false) = false
     ORDER BY successor.presentation_fallback_at, successor.id
     LIMIT 100
  LOOP
    v_release_mode := CASE
      WHEN v_due.acknowledgements_complete THEN 'acknowledged'
      ELSE 'fallback'
    END;
    SELECT private.activate_prepared_holm_hand_exact(
      v_due.game_id,
      v_due.predecessor_round_id,
      v_due.successor_round_id,
      v_release_mode
    ) INTO v_result;

    IF v_result->>'outcome' IN ('activated', 'already-active') THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_holm_prepared_hand_dealt(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_holm_prepared_hand_dealt(uuid, uuid, uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_prepared_holm_hand(uuid, uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION private.activate_prepared_holm_hand_exact(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.release_due_holm_presentations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.release_due_holm_presentations() TO service_role;

COMMENT ON TABLE private.holm_hand_presentation_ack_requirements IS
  'Immutable per-successor active-human cohort. One row per player; acknowledgement records exact client deal completion without granting gameplay authority.';
COMMENT ON FUNCTION public.acknowledge_holm_prepared_hand_dealt(uuid, uuid, uuid, uuid, integer) IS
  'Authenticated, exact-identity, replay-safe Holm prepared-deal acknowledgement. The final required acknowledgement activates the already-prepared hand.';
COMMENT ON FUNCTION private.release_due_holm_presentations() IS
  'Server recovery owner. Activates acknowledgement-complete paused/resumed hands or hands whose configurable missing-acknowledgement lease expired.';

DO $schedule$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'release-due-holm-presentations-1s'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'release-due-holm-presentations-1s',
    '1 second',
    $cron$SELECT private.release_due_holm_presentations();$cron$
  );
END;
$schedule$;
