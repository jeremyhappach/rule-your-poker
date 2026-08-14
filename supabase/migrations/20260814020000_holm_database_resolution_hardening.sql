-- Holm must never depend on a browser surviving the final decision.  PostgreSQL
-- already owns card evaluation primitives; this migration composes them into
-- one replay-safe multi-player resolver and makes successor preparation part
-- of every continuing settlement.

CREATE OR REPLACE FUNCTION public.resolve_holm_showdown(
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
  v_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_active_count integer;
  v_decided_count integer;
  v_stayer_count integer;
  v_round_pot integer;
  v_pot_match integer;
  v_new_pot integer;
  v_player record;
  v_value integer[];
  v_max_value integer[] := NULL;
  v_chucky_value integer[];
  v_first_label text := NULL;
  v_chucky_label text;
  v_winner_ids uuid[] := ARRAY[]::uuid[];
  v_winner_names text[] := ARRAY[]::text[];
  v_loser_ids uuid[] := ARRAY[]::uuid[];
  v_chucky_winner_ids uuid[] := ARRAY[]::uuid[];
  v_chucky_winner_names text[] := ARRAY[]::text[];
  v_chucky_loser_ids uuid[] := ARRAY[]::uuid[];
  v_all_user_ids uuid[];
  v_used_cards jsonb;
  v_chucky_cards jsonb;
  v_all_tied_with_chucky boolean := true;
  v_deltas jsonb := '{}'::jsonb;
  v_settlement jsonb;
  v_successor_id uuid;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'resolve_holm_showdown:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'resolve_holm_showdown:not_holm_game';
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
    RAISE EXCEPTION 'resolve_holm_showdown:not_participant';
  END IF;

  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_expected_round_id
    AND game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-round');
  END IF;

  IF v_round.status = 'completed' THEN
    SELECT id INTO v_successor_id
    FROM public.rounds
    WHERE holm_predecessor_round_id = v_round.id;

    RETURN jsonb_build_object(
      'outcome', 'already-resolved',
      'round_id', v_round.id,
      'successor_round_id', v_successor_id,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal-state', 'status', v_game.status);
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF v_round.status NOT IN ('betting', 'processing', 'showdown') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'invalid-round-status', 'status', v_round.status);
  END IF;

  -- Lock all participating rows in UUID order before reading decisions or
  -- balances.  This is the same lock order used by settlement (game -> round
  -- -> players) and prevents competing last-decision/recovery transactions.
  PERFORM 1
  FROM public.players participant
  WHERE participant.game_id = p_game_id
    AND participant.status = 'active'
    AND participant.sitting_out = false
  ORDER BY participant.id
  FOR UPDATE;

  SELECT count(*),
         count(*) FILTER (WHERE decision_locked AND current_decision IN ('stay', 'fold')),
         count(*) FILTER (WHERE current_decision = 'stay'),
         array_agg(user_id ORDER BY id) FILTER (WHERE user_id IS NOT NULL)
    INTO v_active_count, v_decided_count, v_stayer_count, v_all_user_ids
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false;

  IF coalesce(v_active_count, 0) = 0 OR v_decided_count <> v_active_count THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'decisions-pending');
  END IF;

  IF v_stayer_count < 2 THEN
    -- All-fold and solo-vs-Chucky are resolved inside holm_submit_decision.
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'not-multiplayer-showdown');
  END IF;

  IF jsonb_array_length(coalesce(v_round.community_cards, '[]'::jsonb)) <> 4
     OR EXISTS (
       SELECT 1
       FROM public.player_cards card
       JOIN public.players participant ON participant.id = card.player_id
       WHERE card.round_id = v_round.id
         AND participant.game_id = p_game_id
         AND participant.status = 'active'
         AND participant.sitting_out = false
         AND participant.current_decision = 'stay'
         AND jsonb_array_length(coalesce(card.cards, '[]'::jsonb)) <> 4
     )
     OR (
       SELECT count(*)
       FROM public.player_cards card
       JOIN public.players participant ON participant.id = card.player_id
       WHERE card.round_id = v_round.id
         AND participant.game_id = p_game_id
         AND participant.status = 'active'
         AND participant.sitting_out = false
         AND participant.current_decision = 'stay'
     ) <> v_stayer_count THEN
    RAISE EXCEPTION 'resolve_holm_showdown:incomplete_showdown_cards';
  END IF;

  -- Publish the completed reveal in the same authoritative commit as the
  -- result.  Presentation may animate that persisted state but never writes
  -- cards, rank, money, or lifecycle state.
  UPDATE public.rounds
     SET status = 'showdown',
         current_turn_position = NULL,
         decision_deadline = NULL,
         presentation_fallback_at = NULL,
         community_cards_revealed = greatest(coalesce(community_cards_revealed, 0), 4)
   WHERE id = v_round.id;

  UPDATE public.player_cards
     SET visible_to_user_ids = v_all_user_ids,
         is_public = true
   WHERE round_id = v_round.id
     AND player_id IN (
       SELECT id
       FROM public.players
       WHERE game_id = p_game_id
         AND status = 'active'
         AND sitting_out = false
         AND current_decision = 'stay'
     );

  v_round_pot := coalesce(v_round.pot, v_game.pot, 0);

  FOR v_player IN
    SELECT participant.id, participant.user_id,
           coalesce(profile.username, participant.user_id::text, 'Player') AS username,
           card.cards
    FROM public.players participant
    JOIN public.player_cards card
      ON card.player_id = participant.id
     AND card.round_id = v_round.id
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
    WHERE participant.game_id = p_game_id
      AND participant.status = 'active'
      AND participant.sitting_out = false
      AND participant.current_decision = 'stay'
    ORDER BY participant.id
  LOOP
    v_value := public.holm_best_hand_value(v_player.cards || v_round.community_cards);
    IF v_max_value IS NULL OR v_value > v_max_value THEN
      v_max_value := v_value;
      v_first_label := public.holm_hand_label(v_value);
    END IF;
  END LOOP;

  FOR v_player IN
    SELECT participant.id, participant.user_id,
           coalesce(profile.username, participant.user_id::text, 'Player') AS username,
           card.cards
    FROM public.players participant
    JOIN public.player_cards card
      ON card.player_id = participant.id
     AND card.round_id = v_round.id
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
    WHERE participant.game_id = p_game_id
      AND participant.status = 'active'
      AND participant.sitting_out = false
      AND participant.current_decision = 'stay'
    ORDER BY participant.id
  LOOP
    v_value := public.holm_best_hand_value(v_player.cards || v_round.community_cards);
    IF v_value = v_max_value THEN
      v_winner_ids := array_append(v_winner_ids, v_player.id);
      v_winner_names := array_append(v_winner_names, v_player.username);
    ELSE
      v_loser_ids := array_append(v_loser_ids, v_player.id);
    END IF;
  END LOOP;

  IF cardinality(v_loser_ids) > 0 THEN
    v_pot_match := CASE WHEN coalesce(v_game.pot_max_enabled, true)
      THEN least(v_round_pot, coalesce(v_game.pot_max_value, v_round_pot))
      ELSE v_round_pot
    END;
    v_new_pot := cardinality(v_loser_ids) * v_pot_match;

    IF cardinality(v_winner_ids) = 1 THEN
      v_deltas := jsonb_build_object(v_winner_ids[1]::text, v_round_pot);
      FOREACH v_successor_id IN ARRAY v_loser_ids LOOP
        v_deltas := v_deltas || jsonb_build_object(v_successor_id::text, -v_pot_match);
      END LOOP;
      SELECT public.holm_settle_hand(
        p_game_id, v_round.dealer_game_id, v_round.hand_number,
        'showdown_final_award'::public.holm_event_kind, v_new_pot, true,
        format('%s won with %s|||WINNER:%s|||LOSERS:%s|||POT:%s|||MATCH:%s',
          v_winner_names[1], v_first_label, v_winner_ids[1], array_to_string(v_loser_ids, ','), v_round_pot, v_pot_match),
        v_deltas, 'Won showdown (continues vs Chucky)', v_winner_ids[1], v_winner_names[1], false,
        v_round_pot, true, v_new_pot, false, false
      ) INTO v_settlement;
    ELSE
      v_deltas := '{}'::jsonb;
      FOREACH v_successor_id IN ARRAY v_winner_ids LOOP
        v_deltas := v_deltas || jsonb_build_object(
          v_successor_id::text,
          floor(v_round_pot::numeric / cardinality(v_winner_ids))::integer
        );
      END LOOP;
      FOREACH v_successor_id IN ARRAY v_loser_ids LOOP
        v_deltas := v_deltas || jsonb_build_object(v_successor_id::text, -v_pot_match);
      END LOOP;
      SELECT public.holm_settle_hand(
        p_game_id, v_round.dealer_game_id, v_round.hand_number,
        'partial_tie_final_award'::public.holm_event_kind, v_new_pot, true,
        format('%s tied and split the pot with %s|||WINNERS:%s|||LOSERS:%s|||POT:%s|||MATCH:%s',
          array_to_string(v_winner_names, ' and '), v_first_label, array_to_string(v_winner_ids, ','), array_to_string(v_loser_ids, ','), v_round_pot, v_pot_match),
        v_deltas, 'Tied and split pot (continues vs Chucky)', NULL, array_to_string(v_winner_names, ' and '), true,
        v_round_pot, true, v_new_pot, false, false
      ) INTO v_settlement;
    END IF;

    RETURN jsonb_build_object('outcome', 'resolved', 'event_kind', v_settlement->>'event_kind', 'round_id', v_round.id, 'deduped', false);
  END IF;

  -- Every player tied.  Deal (or retain) the deterministic Chucky hand and
  -- resolve the final comparison without any browser timing or randomness.
  SELECT coalesce(jsonb_agg(card), '[]'::jsonb)
    INTO v_used_cards
  FROM (
    SELECT jsonb_array_elements(card.cards) AS card
    FROM public.player_cards card
    WHERE card.round_id = v_round.id
    UNION ALL
    SELECT jsonb_array_elements(v_round.community_cards) AS card
  ) used;

  v_chucky_cards := coalesce(
    nullif(v_round.chucky_cards, '[]'::jsonb),
    public.holm_deterministic_chucky_cards(v_round.id, v_used_cards, coalesce(v_game.chucky_cards, 4))
  );
  IF jsonb_array_length(v_chucky_cards) <> coalesce(v_game.chucky_cards, 4) THEN
    RAISE EXCEPTION 'resolve_holm_showdown:unable_to_deal_chucky';
  END IF;

  v_chucky_value := public.holm_best_hand_value(v_chucky_cards || v_round.community_cards);
  v_chucky_label := public.holm_hand_label(v_chucky_value);

  UPDATE public.rounds
     SET chucky_cards = v_chucky_cards,
         chucky_cards_revealed = jsonb_array_length(v_chucky_cards),
         chucky_active = true
   WHERE id = v_round.id;

  FOR v_player IN
    SELECT participant.id, coalesce(profile.username, participant.user_id::text, 'Player') AS username, card.cards
    FROM public.players participant
    JOIN public.player_cards card ON card.player_id = participant.id AND card.round_id = v_round.id
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
    WHERE participant.id = ANY(v_winner_ids)
    ORDER BY participant.id
  LOOP
    v_value := public.holm_best_hand_value(v_player.cards || v_round.community_cards);
    IF v_value > v_chucky_value THEN
      v_chucky_winner_ids := array_append(v_chucky_winner_ids, v_player.id);
      v_chucky_winner_names := array_append(v_chucky_winner_names, v_player.username);
      IF v_first_label IS NULL THEN v_first_label := public.holm_hand_label(v_value); END IF;
    ELSE
      v_chucky_loser_ids := array_append(v_chucky_loser_ids, v_player.id);
      IF v_value IS DISTINCT FROM v_chucky_value THEN v_all_tied_with_chucky := false; END IF;
    END IF;
  END LOOP;

  v_pot_match := CASE WHEN coalesce(v_game.pot_max_enabled, true)
    THEN least(v_round_pot, coalesce(v_game.pot_max_value, v_round_pot))
    ELSE v_round_pot
  END;

  IF cardinality(v_chucky_winner_ids) > 0 THEN
    v_deltas := '{}'::jsonb;
    FOREACH v_successor_id IN ARRAY v_chucky_winner_ids LOOP
      v_deltas := v_deltas || jsonb_build_object(
        v_successor_id::text,
        floor(v_round_pot::numeric / cardinality(v_chucky_winner_ids))::integer
      );
    END LOOP;
    FOREACH v_successor_id IN ARRAY v_chucky_loser_ids LOOP
      v_deltas := v_deltas || jsonb_build_object(v_successor_id::text, -v_pot_match);
    END LOOP;
    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      'chucky_final_award'::public.holm_event_kind, 0, false,
      format('%s beat Chucky!|||POT:%s', array_to_string(v_chucky_winner_names, ' and '), v_round_pot),
      v_deltas, coalesce(v_first_label, 'Winning hand'), v_chucky_winner_ids[1], array_to_string(v_chucky_winner_names, ' and '),
      cardinality(v_chucky_winner_ids) > 1, v_round_pot, true, v_round_pot, true, true
    ) INTO v_settlement;
  ELSE
    v_new_pot := v_round_pot + cardinality(v_chucky_loser_ids) * v_pot_match;
    v_deltas := '{}'::jsonb;
    FOREACH v_successor_id IN ARRAY v_chucky_loser_ids LOOP
      v_deltas := v_deltas || jsonb_build_object(v_successor_id::text, -v_pot_match);
    END LOOP;
    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      'chucky_tiebreak_pot_match'::public.holm_event_kind, v_new_pot, true,
      CASE WHEN v_all_tied_with_chucky
        THEN format('Ya tie but ya lose! %s lose to Chucky''s %s. $%s added to pot.', array_to_string(v_winner_names, ' and '), v_chucky_label, cardinality(v_chucky_loser_ids) * v_pot_match)
        ELSE format('Tie broken by Chucky! %s lose to Chucky''s %s. $%s added to pot.', array_to_string(v_winner_names, ' and '), v_chucky_label, cardinality(v_chucky_loser_ids) * v_pot_match)
      END,
      v_deltas, CASE WHEN v_all_tied_with_chucky THEN 'Tie - all match pot' ELSE format('Chucky beat tied players with %s', v_chucky_label) END,
      NULL, 'Chucky Win (Tie Breaker)', false, 0, true, v_new_pot, true, false
    ) INTO v_settlement;
  END IF;

  RETURN jsonb_build_object('outcome', 'resolved', 'event_kind', v_settlement->>'event_kind', 'round_id', v_round.id, 'deduped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_holm_showdown(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_holm_showdown(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_holm_showdown(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_holm_showdown(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.resolve_holm_showdown(uuid, uuid) IS
  'Database-owned Holm multi-player result owner. Evaluates the persisted cards, settles once, and leaves at most one prepared successor.';

-- All continuing settlements prepare their successor during the same commit.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  -- A continuing Chucky loss prepares its successor in this same transaction.\n  -- The successor is non-actionable until presentation activation.\n  IF p_event_kind IN (''chucky_loss_pot_match'', ''chucky_tiebreak_pot_match'')\n     AND p_awaiting_next_round\n     AND NOT v_end_game THEN\n    PERFORM public.prepare_next_holm_hand(p_game_id, v_round.id);\n  END IF;';
  v_after text := E'  -- Every continuing Holm settlement prepares its exact non-actionable\n  -- successor before the result is published.  Presentation only acknowledges\n  -- activation; it can never be the sole creator of a hand.\n  IF p_awaiting_next_round\n     AND NOT v_end_game THEN\n    PERFORM public.prepare_next_holm_hand(p_game_id, v_round.id);\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)'::regprocedure
  ) INTO v_definition;
  IF position(v_after IN v_definition) = 0 THEN
    IF position(v_before IN v_definition) = 0 THEN
      RAISE EXCEPTION 'holm_database_resolution_hardening:settlement_boundary_not_found';
    END IF;
    EXECUTE replace(v_definition, v_before, v_after);
  END IF;
END;
$migration$;

-- The exact-round decision RPC has already locked the game and hand.  When
-- the final action is a multi-player showdown, resolve it before that RPC
-- returns so no client callback is a lifecycle owner.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  IF coalesce((v_result->>''all_decisions_in'')::boolean, false) THEN\n    UPDATE public.rounds';
  v_after text := E'  IF coalesce((v_result->>''all_decisions_in'')::boolean, false) THEN\n    IF coalesce((v_result->>''server_resolved'')::boolean, true) IS FALSE THEN\n      SELECT public.resolve_holm_showdown(p_game_id, v_round.id) INTO v_result;\n    END IF;\n\n    UPDATE public.rounds';
BEGIN
  SELECT pg_get_functiondef('public.holm_submit_decision(uuid,uuid,uuid,text)'::regprocedure)
    INTO v_definition;
  IF position('public.resolve_holm_showdown(p_game_id, v_round.id)' IN v_definition) = 0 THEN
    IF position(v_before IN v_definition) = 0 THEN
      RAISE EXCEPTION 'holm_database_resolution_hardening:decision_boundary_not_found';
    END IF;
    EXECUTE replace(v_definition, v_before, v_after);
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.recover_pending_holm_showdowns(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate record;
  v_result jsonb;
  v_resolved integer := 0;
  v_rejected integer := 0;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'recover_pending_holm_showdowns:service_role_required';
  END IF;

  FOR v_candidate IN
    SELECT game.id AS game_id, round.id AS round_id
    FROM public.games game
    JOIN public.rounds round
      ON round.game_id = game.id
     AND round.dealer_game_id IS NOT DISTINCT FROM game.current_game_uuid
    WHERE game.id = p_game_id
      AND game.game_type IN ('holm', 'holm-game')
      AND game.status NOT IN ('game_over', 'session_ended')
      AND coalesce(game.is_paused, false) = false
      AND round.status IN ('betting', 'processing', 'showdown')
      AND EXISTS (
        SELECT 1
        FROM public.players participant
        WHERE participant.game_id = game.id
          AND participant.status = 'active'
          AND participant.sitting_out = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.players participant
        WHERE participant.game_id = game.id
          AND participant.status = 'active'
          AND participant.sitting_out = false
          AND (NOT participant.decision_locked OR participant.current_decision NOT IN ('stay', 'fold'))
      )
    ORDER BY game.id, round.id
    LIMIT 100
  LOOP
    SELECT public.resolve_holm_showdown(v_candidate.game_id, v_candidate.round_id) INTO v_result;
    IF v_result->>'outcome' IN ('resolved', 'already-resolved') THEN
      v_resolved := v_resolved + 1;
    ELSE
      v_rejected := v_rejected + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('resolved', v_resolved, 'rejected', v_rejected);
END;
$$;

REVOKE ALL ON FUNCTION public.recover_pending_holm_showdowns(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_pending_holm_showdowns(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.recover_pending_holm_showdowns(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recover_pending_holm_showdowns(uuid) TO service_role;

COMMENT ON FUNCTION public.recover_pending_holm_showdowns(uuid) IS
  'Service-only recovery for a legacy Holm hand whose final decisions persisted before database-owned resolution was available.';
