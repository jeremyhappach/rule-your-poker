-- Cribbage authority cutover.
--
-- Private state owns hidden cards and gameplay truth. public.rounds retains a
-- redacted realtime projection so the canonical shell keeps its existing
-- subscription and identity continuity without exposing opponent cards.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.cribbage_round_states (
  round_id uuid PRIMARY KEY REFERENCES public.rounds(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE private.cribbage_round_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.cribbage_round_states FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cribbage_mask_cards(p_cards jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', '?',
        'suit', 'spades',
        'value', 0,
        'masked', true
      )
      ORDER BY card.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) WITH ORDINALITY AS card(value, ordinality);
$$;

CREATE OR REPLACE FUNCTION private.cribbage_public_state(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_state jsonb := p_state;
  v_player_id text;
  v_player_state jsonb;
  v_reveal boolean := coalesce(p_state->>'phase', '') IN ('counting', 'complete');
BEGIN
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RETURN v_state;
  END IF;

  FOR v_player_id IN SELECT jsonb_object_keys(coalesce(v_state->'playerStates', '{}'::jsonb)) LOOP
    v_player_state := v_state->'playerStates'->v_player_id;
    v_player_state := jsonb_set(
      v_player_state,
      '{hand}',
      private.cribbage_mask_cards(v_player_state->'hand'),
      true
    );
    IF NOT v_reveal THEN
      v_player_state := jsonb_set(
        v_player_state,
        '{discardedToCrib}',
        private.cribbage_mask_cards(v_player_state->'discardedToCrib'),
        true
      );
    END IF;
    v_state := jsonb_set(v_state, ARRAY['playerStates', v_player_id], v_player_state, true);
  END LOOP;

  IF NOT v_reveal THEN
    v_state := jsonb_set(v_state, '{crib}', private.cribbage_mask_cards(v_state->'crib'), true);
  END IF;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_project_state(
  p_state jsonb,
  p_game_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_state jsonb := private.cribbage_public_state(p_state);
  v_player_id uuid;
  v_private_player jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_state IS NULL THEN
    RETURN v_state;
  END IF;

  SELECT participant.id
    INTO v_player_id
    FROM public.players participant
   WHERE participant.game_id = p_game_id
     AND participant.user_id = p_actor_id
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  IF v_player_id IS NULL OR NOT (p_state->'playerStates' ? v_player_id::text) THEN
    RETURN v_state;
  END IF;

  v_private_player := p_state->'playerStates'->v_player_id::text;
  v_state := jsonb_set(
    v_state,
    ARRAY['playerStates', v_player_id::text, 'hand'],
    coalesce(v_private_player->'hand', '[]'::jsonb),
    true
  );
  v_state := jsonb_set(
    v_state,
    ARRAY['playerStates', v_player_id::text, 'discardedToCrib'],
    coalesce(v_private_player->'discardedToCrib', '[]'::jsonb),
    true
  );
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_publish_state(p_round_id uuid, p_state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  INSERT INTO private.cribbage_round_states(round_id, state, version, updated_at)
  VALUES (p_round_id, p_state, 1, clock_timestamp())
  ON CONFLICT (round_id) DO UPDATE
    SET state = EXCLUDED.state,
        version = private.cribbage_round_states.version + 1,
        updated_at = clock_timestamp();

  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.rounds
     SET cribbage_state = private.cribbage_public_state(p_state)
   WHERE id = p_round_id;
END;
$$;

REVOKE ALL ON FUNCTION private.cribbage_mask_cards(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cribbage_public_state(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cribbage_project_state(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cribbage_publish_state(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Prevent the legacy public-state trigger from observing the one-time
-- redaction. It is restored after the private-state finalizer is installed.
DROP TRIGGER IF EXISTS cribbage_finish_counting_handoff ON public.rounds;

-- Capture every existing state before the public projection is redacted.
INSERT INTO private.cribbage_round_states(round_id, state)
SELECT round_row.id, round_row.cribbage_state
  FROM public.rounds round_row
  JOIN public.games game_row ON game_row.id = round_row.game_id
 WHERE game_row.game_type = 'cribbage'
   AND round_row.cribbage_state IS NOT NULL
ON CONFLICT (round_id) DO NOTHING;

SELECT set_config('app.cribbage_authoritative_write', 'on', true);
UPDATE public.rounds round_row
   SET cribbage_state = private.cribbage_public_state(authority.state)
  FROM private.cribbage_round_states authority
 WHERE authority.round_id = round_row.id
   AND round_row.cribbage_state IS DISTINCT FROM private.cribbage_public_state(authority.state);

CREATE OR REPLACE FUNCTION private.cribbage_guard_round_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game_id uuid;
  v_is_cribbage boolean:=false;
  v_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_trusted boolean := coalesce(current_setting('app.cribbage_authoritative_write', true), '') = 'on';
BEGIN
  v_game_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  SELECT EXISTS(SELECT 1 FROM public.games WHERE id=v_game_id AND game_type='cribbage')
    INTO v_is_cribbage;
  IF TG_OP='UPDATE' AND NOT v_is_cribbage THEN
    SELECT EXISTS(SELECT 1 FROM public.games WHERE id=OLD.game_id AND game_type='cribbage')
      INTO v_is_cribbage;
  END IF;
  IF v_is_cribbage AND NOT v_service_role AND NOT v_trusted THEN
    RAISE EXCEPTION 'cribbage_round_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS cribbage_guard_round_insert ON public.rounds;
CREATE TRIGGER cribbage_guard_round_insert
BEFORE INSERT ON public.rounds
FOR EACH ROW
EXECUTE FUNCTION private.cribbage_guard_round_mutation();

DROP TRIGGER IF EXISTS cribbage_guard_round_update ON public.rounds;
CREATE TRIGGER cribbage_guard_round_update
BEFORE UPDATE ON public.rounds
FOR EACH ROW
EXECUTE FUNCTION private.cribbage_guard_round_mutation();

DROP TRIGGER IF EXISTS cribbage_guard_round_delete ON public.rounds;
CREATE TRIGGER cribbage_guard_round_delete
BEFORE DELETE ON public.rounds
FOR EACH ROW
EXECUTE FUNCTION private.cribbage_guard_round_mutation();

REVOKE ALL ON FUNCTION private.cribbage_guard_round_mutation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cribbage_guard_player_cards_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_round_id uuid;
  v_is_cribbage boolean:=false;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_trusted boolean:=coalesce(current_setting('app.cribbage_authoritative_write',true),'')='on';
BEGIN
  v_round_id:=CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
  SELECT EXISTS(
    SELECT 1 FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
    WHERE round_row.id=v_round_id AND game_row.game_type='cribbage'
  ) INTO v_is_cribbage;
  IF TG_OP='UPDATE' AND NOT v_is_cribbage THEN
    SELECT EXISTS(
      SELECT 1 FROM public.rounds round_row
      JOIN public.games game_row ON game_row.id=round_row.game_id
      WHERE round_row.id=OLD.round_id AND game_row.game_type='cribbage'
    ) INTO v_is_cribbage;
  END IF;
  IF v_is_cribbage AND NOT v_service AND NOT v_trusted THEN
    RAISE EXCEPTION 'cribbage_player_cards_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS cribbage_guard_player_cards_mutation ON public.player_cards;
CREATE TRIGGER cribbage_guard_player_cards_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.player_cards
FOR EACH ROW
EXECUTE FUNCTION private.cribbage_guard_player_cards_mutation();

CREATE OR REPLACE FUNCTION private.cribbage_guard_game_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_trusted boolean:=coalesce(current_setting('app.cribbage_authoritative_write',true),'')='on';
BEGIN
  IF (OLD.game_type='cribbage' OR NEW.game_type='cribbage')
     AND NOT v_service AND NOT v_trusted THEN
    RAISE EXCEPTION 'cribbage_game_authority_mutation:rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cribbage_guard_game_authority ON public.games;
CREATE TRIGGER cribbage_guard_game_authority
BEFORE UPDATE OF dealer_selection_state,dealer_position,current_round,total_hands ON public.games
FOR EACH ROW
WHEN (
  OLD.dealer_selection_state IS DISTINCT FROM NEW.dealer_selection_state
  OR OLD.dealer_position IS DISTINCT FROM NEW.dealer_position
  OR OLD.current_round IS DISTINCT FROM NEW.current_round
  OR OLD.total_hands IS DISTINCT FROM NEW.total_hands
)
EXECUTE FUNCTION private.cribbage_guard_game_authority();

REVOKE ALL ON FUNCTION private.cribbage_guard_player_cards_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_guard_game_authority() FROM PUBLIC,anon,authenticated;

-- The old trigger read the public document and could therefore no longer own
-- a hidden-card transition. The discard RPC below performs that transition
-- under the same row lock as the final discard.
DROP TRIGGER IF EXISTS cribbage_finish_discard_transition ON public.rounds;

CREATE OR REPLACE FUNCTION public.cribbage_get_state(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'cribbage_get_state:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id = _round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_get_state:round_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players participant
     WHERE participant.game_id = v_round.game_id
       AND participant.user_id = v_actor_id
       AND participant.status <> 'left'
  ) AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_get_state:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = _round_id;
  v_state := coalesce(v_state, v_round.cribbage_state);
  RETURN private.cribbage_project_state(v_state, v_round.game_id, v_actor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_get_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_get_state(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cribbage_prepare_dealer_selection(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player record;
  v_tied_ids uuid[];
  v_next_tied uuid[];
  v_cards jsonb := '[]'::jsonb;
  v_deck jsonb;
  v_card jsonb;
  v_round integer := 1;
  v_offset integer := 0;
  v_high integer;
  v_rank_value integer;
  v_winner_id uuid;
  v_winner_position integer;
  v_state jsonb;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:authentication_required';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:not_cribbage_game';
  END IF;
  IF NOT v_is_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:not_in_session';
  END IF;
  IF v_game.dealer_selection_state->>'isComplete' = 'true'
     AND v_game.dealer_selection_state->>'winnerPosition' IS NOT NULL THEN
    RETURN v_game.dealer_selection_state;
  END IF;
  IF v_game.status IS DISTINCT FROM 'cribbage_dealer_selection' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'wrong_status', 'status', v_game.status);
  END IF;

  SELECT array_agg(id ORDER BY position) INTO v_tied_ids
    FROM public.players
   WHERE game_id = _game_id
     AND NOT coalesce(sitting_out, false)
     AND status NOT IN ('observer', 'left');
  IF coalesce(cardinality(v_tied_ids), 0) < 2 OR cardinality(v_tied_ids) > 4 THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:invalid_player_count';
  END IF;

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card, random() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
  ) SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;

  LOOP
    IF v_offset + cardinality(v_tied_ids) > jsonb_array_length(v_deck) THEN
      WITH deck AS (
        SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card, random() AS shuffle_key
          FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
          CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
      ) SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;
      v_offset := 0;
    END IF;
    v_high := 0;
    v_next_tied := ARRAY[]::uuid[];
    FOREACH v_winner_id IN ARRAY v_tied_ids LOOP
      SELECT * INTO v_player FROM public.players WHERE id = v_winner_id;
      v_card := v_deck->v_offset;
      v_offset := v_offset + 1;
      v_rank_value := CASE v_card->>'rank'
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE (v_card->>'rank')::integer END;
      IF v_rank_value > v_high THEN
        v_high := v_rank_value;
        v_next_tied := ARRAY[v_winner_id];
      ELSIF v_rank_value = v_high THEN
        v_next_tied := array_append(v_next_tied, v_winner_id);
      END IF;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'playerId', v_winner_id,
        'position', v_player.position,
        'card', v_card,
        'isRevealed', true,
        'isWinner', false,
        'isDimmed', false,
        'roundNumber', v_round
      ));
    END LOOP;
    v_tied_ids := v_next_tied;
    EXIT WHEN cardinality(v_tied_ids) = 1;
    v_round := v_round + 1;
  END LOOP;

  v_winner_id := v_tied_ids[1];
  SELECT position INTO v_winner_position FROM public.players WHERE id = v_winner_id;
  SELECT coalesce(jsonb_agg(
    CASE WHEN card.value->>'playerId' = v_winner_id::text
      THEN card.value || jsonb_build_object('isWinner', true, 'isDimmed', false)
      ELSE card.value || jsonb_build_object('isWinner', false, 'isDimmed', true)
    END ORDER BY card.ordinality
  ), '[]'::jsonb)
  INTO v_cards
  FROM jsonb_array_elements(v_cards) WITH ORDINALITY card(value, ordinality);

  v_state := jsonb_build_object(
    'cards', v_cards,
    'announcement', 'Dealer selected',
    'isComplete', true,
    'winnerPosition', v_winner_position,
    'preparedAt', to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.games SET dealer_selection_state = v_state WHERE id = _game_id;
  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_prepare_dealer_selection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_prepare_dealer_selection(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.cribbage_new_deck()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
  WITH deck AS (
    SELECT jsonb_build_object(
      'rank', rank,
      'suit', suit,
      'value', CASE WHEN rank = 'A' THEN 1 WHEN rank IN ('J','Q','K') THEN 10 ELSE rank::integer END
    ) AS card, random() AS shuffle_key
    FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
    CROSS JOIN unnest(ARRAY['hearts','diamonds','clubs','spades']) AS suits(suit)
  ) SELECT jsonb_agg(card ORDER BY shuffle_key) FROM deck;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_initial_state(
  p_game public.games,
  p_player_ids uuid[],
  p_dealer_id uuid,
  p_deck jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_player_count integer := cardinality(p_player_ids);
  v_cards_per_player integer := CASE WHEN cardinality(p_player_ids) = 2 THEN 6 ELSE 5 END;
  v_states jsonb := '{}'::jsonb;
  v_order jsonb := '[]'::jsonb;
  v_hand jsonb;
  v_offset integer := 0;
  v_player_id uuid;
  v_dealer_index integer;
  v_index integer;
  v_harness text;
  v_harness_enabled boolean := false;
  v_harness_target uuid;
  v_score integer;
BEGIN
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type = 'cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean, false) INTO v_harness_enabled
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode' LIMIT 1;
  SELECT participant.id
    INTO v_harness_target
    FROM public.players participant
   WHERE participant.game_id = p_game.id
     AND participant.id = ANY(p_player_ids)
   ORDER BY CASE WHEN participant.user_id = p_game.current_host THEN 0 ELSE 1 END,
            CASE WHEN coalesce(participant.is_bot, false) THEN 1 ELSE 0 END,
            participant.position,
            participant.id
   LIMIT 1;

  IF coalesce(v_harness_enabled, false) AND v_harness = 'max_pegging_fan' AND v_player_count = 2 THEN
    p_deck := jsonb_build_array(
      jsonb_build_object('rank','A','suit','spades','value',1),
      jsonb_build_object('rank','A','suit','hearts','value',1),
      jsonb_build_object('rank','2','suit','spades','value',2),
      jsonb_build_object('rank','2','suit','hearts','value',2),
      jsonb_build_object('rank','3','suit','spades','value',3),
      jsonb_build_object('rank','3','suit','hearts','value',3),
      jsonb_build_object('rank','A','suit','diamonds','value',1),
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','2','suit','diamonds','value',2),
      jsonb_build_object('rank','2','suit','clubs','value',2),
      jsonb_build_object('rank','3','suit','diamonds','value',3),
      jsonb_build_object('rank','3','suit','clubs','value',3)
    ) || p_deck;
  END IF;

  FOREACH v_player_id IN ARRAY p_player_ids LOOP
    SELECT coalesce(jsonb_agg(card.value ORDER BY card.ordinality), '[]'::jsonb)
      INTO v_hand
      FROM jsonb_array_elements(p_deck) WITH ORDINALITY card(value, ordinality)
     WHERE card.ordinality > v_offset
       AND card.ordinality <= v_offset + v_cards_per_player;
    v_offset := v_offset + v_cards_per_player;
    v_score := CASE WHEN coalesce(v_harness_enabled, false) AND v_harness = 'near_double_skunk'
                    THEN CASE WHEN v_player_id = v_harness_target THEN 119 ELSE 10 END
                    ELSE 0 END;
    v_states := jsonb_set(v_states, ARRAY[v_player_id::text], jsonb_build_object(
      'playerId', v_player_id,
      'hand', v_hand,
      'pegScore', v_score,
      'hasCalledGo', false,
      'discardedToCrib', '[]'::jsonb
    ), true);
  END LOOP;

  v_dealer_index := array_position(p_player_ids, p_dealer_id);
  FOR v_index IN 1..v_player_count LOOP
    v_order := v_order || jsonb_build_array(p_player_ids[((v_dealer_index - 1 + v_index) % v_player_count) + 1]);
  END LOOP;

  RETURN jsonb_build_object(
    'phase', 'discarding',
    'dealerPlayerId', p_dealer_id,
    'cribOwnerPlayerId', p_dealer_id,
    'playerStates', v_states,
    'turnOrder', v_order,
    'crib', '[]'::jsonb,
    'cutCard', NULL,
    'pegging', jsonb_build_object(
      'playedCards', '[]'::jsonb,
      'currentCount', 0,
      'eventSequence', 0,
      'currentTurnPlayerId', v_order->>0,
      'lastToPlay', NULL,
      'goCalledBy', '[]'::jsonb,
      'sequenceStartIndex', 0
    ),
    'anteAmount', coalesce(p_game.ante_amount, 1),
    'pot', 0,
    'pointsToWin', coalesce(p_game.points_to_win, 121),
    'skunkEnabled', coalesce(p_game.skunk_enabled, true),
    'skunkThreshold', coalesce(p_game.skunk_threshold, 91),
    'doubleSkunkEnabled', coalesce(p_game.double_skunk_enabled, true),
    'doubleSkunkThreshold', coalesce(p_game.double_skunk_threshold, 61),
    'lastEvent', NULL,
    'lastHandCount', NULL,
    'winnerPlayerId', NULL,
    'loserScore', NULL,
    'payoutMultiplier', 1,
    'dealerSelectionCohort', 0,
    'dealerResolved', true,
    'matchCompleteLatch', false
  );
END;
$$;

REVOKE ALL ON FUNCTION private.cribbage_new_deck() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cribbage_initial_state(public.games, uuid[], uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_cribbage_initial_hand(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player_ids uuid[];
  v_player_count integer;
  v_dealer_position integer;
  v_dealer_id uuid;
  v_round_id uuid;
  v_state jsonb;
  v_deck jsonb;
  v_player_id uuid;
  v_existing_state jsonb;
BEGIN
  IF v_actor_id IS NULL AND NOT v_service THEN RAISE EXCEPTION 'start_cribbage_initial_hand:authentication_required'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN RAISE EXCEPTION 'start_cribbage_initial_hand:not_cribbage_game'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'start_cribbage_initial_hand:not_in_session';
  END IF;
  SELECT * INTO v_existing FROM public.rounds
   WHERE game_id = _game_id AND dealer_game_id = v_game.current_game_uuid AND hand_number = 1 AND round_number = 1 LIMIT 1;
  IF FOUND THEN
    SELECT state INTO v_existing_state FROM private.cribbage_round_states WHERE round_id=v_existing.id;
    IF v_existing_state IS NOT NULL THEN
      RETURN jsonb_build_object('outcome','already-started','round_id',v_existing.id,'hand_number',1,'deduped',true);
    END IF;
    v_round_id:=v_existing.id;
  END IF;
  IF v_game.status IS DISTINCT FROM 'cribbage_dealer_selection' OR v_game.current_game_uuid IS NULL THEN
    RETURN jsonb_build_object('outcome','rejected','reason','wrong_status','status',v_game.status);
  END IF;
  IF v_game.dealer_selection_state->>'isComplete' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','dealer_not_resolved');
  END IF;
  v_dealer_position := (v_game.dealer_selection_state->>'winnerPosition')::integer;
  SELECT array_agg(id ORDER BY position), count(*)::integer
    INTO v_player_ids, v_player_count
    FROM public.players
   WHERE game_id = _game_id AND NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left');
  IF v_player_count < 2 OR v_player_count > 4 THEN RAISE EXCEPTION 'start_cribbage_initial_hand:invalid_player_count'; END IF;
  SELECT id INTO v_dealer_id FROM public.players
   WHERE game_id = _game_id AND position = v_dealer_position AND id = ANY(v_player_ids);
  IF v_dealer_id IS NULL THEN RAISE EXCEPTION 'start_cribbage_initial_hand:dealer_not_in_cohort'; END IF;

  v_deck := private.cribbage_new_deck();
  v_state := private.cribbage_initial_state(v_game, v_player_ids, v_dealer_id, v_deck);
  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  IF v_round_id IS NULL THEN
    INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,cribbage_state)
    VALUES (_game_id,v_game.current_game_uuid,1,1,CASE WHEN v_player_count=2 THEN 6 ELSE 5 END,0,'betting',private.cribbage_public_state(v_state))
    RETURNING id INTO v_round_id;
  ELSE
    UPDATE public.rounds
       SET cards_dealt=CASE WHEN v_player_count=2 THEN 6 ELSE 5 END,
           pot=0,
           status='betting',
           cribbage_state=private.cribbage_public_state(v_state)
     WHERE id=v_round_id;
  END IF;
  INSERT INTO private.cribbage_round_states(round_id,state) VALUES(v_round_id,v_state);
  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    INSERT INTO public.player_cards(player_id,round_id,cards)
    VALUES(v_player_id,v_round_id,v_state->'playerStates'->v_player_id::text->'hand')
    ON CONFLICT (player_id,round_id) DO UPDATE SET cards=EXCLUDED.cards;
  END LOOP;
  UPDATE public.games SET status='in_progress',dealer_position=v_dealer_position,current_round=1,total_hands=1,
    pot=0,is_first_hand=false,dealer_selection_state=NULL WHERE id=_game_id;
  RETURN jsonb_build_object('outcome','started','round_id',v_round_id,'hand_number',1,'dealer_position',v_dealer_position,
    'state',private.cribbage_project_state(v_state,_game_id,v_actor_id),'deduped',false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_cribbage_initial_hand(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_cribbage_initial_hand(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.cribbage_card_value(p_card jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE p_card->>'rank' WHEN 'A' THEN 1 WHEN 'J' THEN 10 WHEN 'Q' THEN 10 WHEN 'K' THEN 10 ELSE (p_card->>'rank')::integer END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_rank_value(p_rank text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE p_rank WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13 ELSE p_rank::integer END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_has_playable(p_hand jsonb, p_count integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,private AS $$
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_hand,'[]'::jsonb)) card WHERE p_count + private.cribbage_card_value(card) <= 31);
$$;

CREATE OR REPLACE FUNCTION private.cribbage_hand_score(p_hand jsonb, p_cut jsonb, p_is_crib boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog,private
AS $$
DECLARE
  v_cards jsonb := coalesce(p_hand,'[]'::jsonb) || CASE WHEN p_cut IS NULL OR p_cut='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(p_cut) END;
  v_n integer := jsonb_array_length(v_cards);
  v_mask integer;
  v_i integer;
  v_sum integer;
  v_fifteens integer := 0;
  v_pairs integer := 0;
  v_runs integer := 0;
  v_flush integer := 0;
  v_nobs integer := 0;
  v_run_start integer;
  v_run_len integer;
  v_best_len integer := 0;
  v_mult integer;
  v_same_suit boolean;
  v_suit text;
  v_count integer;
BEGIN
  IF v_n > 0 THEN
    FOR v_mask IN 1..(1 << v_n)-1 LOOP
      v_sum := 0;
      FOR v_i IN 0..v_n-1 LOOP
        IF (v_mask & (1 << v_i)) <> 0 THEN v_sum := v_sum + private.cribbage_card_value(v_cards->v_i); END IF;
      END LOOP;
      IF v_sum = 15 THEN v_fifteens := v_fifteens + 2; END IF;
    END LOOP;
  END IF;
  SELECT coalesce(sum(card_count*(card_count-1)),0)::integer INTO v_pairs
    FROM (SELECT count(*)::integer card_count FROM jsonb_array_elements(v_cards) card GROUP BY card->>'rank') grouped;

  FOR v_run_start IN 1..13 LOOP
    v_run_len := 0; v_mult := 1;
    FOR v_i IN v_run_start..13 LOOP
      SELECT count(*)::integer INTO v_count FROM jsonb_array_elements(v_cards) card
       WHERE private.cribbage_rank_value(card->>'rank') = v_i;
      EXIT WHEN v_count = 0;
      v_run_len := v_run_len + 1; v_mult := v_mult * v_count;
    END LOOP;
    IF v_run_len >= 3 AND v_run_len > v_best_len THEN v_best_len := v_run_len; v_runs := v_run_len*v_mult; END IF;
  END LOOP;

  IF jsonb_array_length(coalesce(p_hand,'[]'::jsonb)) > 0 THEN
    v_suit := p_hand->0->>'suit';
    SELECT bool_and(card->>'suit'=v_suit) INTO v_same_suit FROM jsonb_array_elements(p_hand) card;
    IF coalesce(v_same_suit,false) THEN
      IF p_cut IS NOT NULL AND p_cut <> 'null'::jsonb AND p_cut->>'suit'=v_suit THEN v_flush:=5;
      ELSIF NOT p_is_crib THEN v_flush:=4; END IF;
    END IF;
    IF p_cut IS NOT NULL AND p_cut <> 'null'::jsonb THEN
      SELECT CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_hand) card WHERE card->>'rank'='J' AND card->>'suit'=p_cut->>'suit') THEN 1 ELSE 0 END INTO v_nobs;
    END IF;
  END IF;
  RETURN jsonb_build_object('fifteens',v_fifteens,'pairs',v_pairs,'runs',v_runs,'flush',v_flush,'nobs',v_nobs,
    'total',v_fifteens+v_pairs+v_runs+v_flush+v_nobs);
END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_hand_combo_points(p_hand jsonb,p_cut jsonb,p_is_crib boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private
AS $$
DECLARE
  v_score jsonb := private.cribbage_hand_score(p_hand,p_cut,p_is_crib);
  v_result jsonb := '[]'::jsonb;
  v_i integer;
  v_count integer;
  v_best_len integer := 0;
  v_run_start integer;
  v_run_len integer;
  v_mult integer := 1;
  v_best_mult integer := 0;
BEGIN
  FOR v_i IN 1..coalesce((v_score->>'fifteens')::integer/2,0) LOOP v_result:=v_result||jsonb_build_array(2); END LOOP;
  FOR v_count IN SELECT count(*)::integer FROM jsonb_array_elements(coalesce(p_hand,'[]'::jsonb)||CASE WHEN p_cut IS NULL OR p_cut='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(p_cut) END) card GROUP BY card->>'rank' HAVING count(*)>=2 LOOP
    v_result:=v_result||jsonb_build_array(v_count*(v_count-1));
  END LOOP;
  FOR v_run_start IN 1..13 LOOP
    v_run_len:=0; v_mult:=1;
    FOR v_i IN v_run_start..13 LOOP
      SELECT count(*)::integer INTO v_count FROM jsonb_array_elements(coalesce(p_hand,'[]'::jsonb)||CASE WHEN p_cut IS NULL OR p_cut='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(p_cut) END) card WHERE private.cribbage_rank_value(card->>'rank')=v_i;
      EXIT WHEN v_count=0; v_run_len:=v_run_len+1; v_mult:=v_mult*v_count;
    END LOOP;
    IF v_run_len>=3 AND v_run_len>v_best_len THEN v_best_len:=v_run_len; v_best_mult:=v_mult; END IF;
  END LOOP;
  IF v_best_len>=3 THEN FOR v_i IN 1..v_best_mult LOOP v_result:=v_result||jsonb_build_array(v_best_len); END LOOP; END IF;
  IF (v_score->>'flush')::integer>0 THEN v_result:=v_result||jsonb_build_array((v_score->>'flush')::integer); END IF;
  IF (v_score->>'nobs')::integer>0 THEN v_result:=v_result||jsonb_build_array(1); END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private.cribbage_card_value(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_rank_value(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_has_playable(jsonb,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_hand_score(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_hand_combo_points(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.cribbage_finish_discard(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_state jsonb:=p_state;
  v_used jsonb := '[]'::jsonb;
  v_available jsonb;
  v_cut jsonb;
  v_player_id text;
  v_score integer;
  v_low integer;
  v_multiplier integer:=1;
  v_harness text;
  v_harness_enabled boolean:=false;
BEGIN
  FOR v_player_id IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP
    v_used:=v_used||coalesce(v_state->'playerStates'->v_player_id->'hand','[]'::jsonb)||coalesce(v_state->'playerStates'->v_player_id->'discardedToCrib','[]'::jsonb);
  END LOOP;
  SELECT coalesce(jsonb_agg(card), '[]'::jsonb) INTO v_available FROM jsonb_array_elements(private.cribbage_new_deck()) card
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_used) used WHERE used->>'rank'=card->>'rank' AND used->>'suit'=card->>'suit');
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type='cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
  IF coalesce(v_harness_enabled,false) AND v_harness='max_pegging_fan' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='spades' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='perpetual_heels' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='J' LIMIT 1; END IF;
  IF v_cut IS NULL THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card ORDER BY random() LIMIT 1; END IF;
  v_state:=jsonb_set(v_state,'{cutCard}',v_cut,true);
  v_state:=jsonb_set(v_state,'{phase}','"pegging"'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',to_jsonb(v_state->'turnOrder'->>0),true);
  IF v_cut->>'rank'='J' THEN
    v_player_id:=v_state->>'dealerPlayerId';
    v_score:=coalesce((v_state->'playerStates'->v_player_id->>'pegScore')::integer,0)+2;
    v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_id,'pegScore'],to_jsonb(v_score),true);
    v_state:=jsonb_set(v_state,'{lastEvent}',jsonb_build_object('id',gen_random_uuid(),'type','his_heels','playerId',v_player_id,'points',2,'label','His Heels','createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
    IF v_score>=coalesce((v_state->>'pointsToWin')::integer,121) THEN
      SELECT min(coalesce((value->>'pegScore')::integer,0)) INTO v_low FROM jsonb_each(v_state->'playerStates') WHERE key<>v_player_id;
      IF coalesce((v_state->>'doubleSkunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'doubleSkunkThreshold')::integer,61) THEN v_multiplier:=3;
      ELSIF coalesce((v_state->>'skunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'skunkThreshold')::integer,91) THEN v_multiplier:=2; END IF;
      v_state:=jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{winnerPlayerId}',to_jsonb(v_player_id),true);
      v_state:=jsonb_set(v_state,'{loserScore}',to_jsonb(v_low),true);
      v_state:=jsonb_set(v_state,'{payoutMultiplier}',to_jsonb(v_multiplier),true);
      v_state:=jsonb_set(v_state,'{matchCompleteLatch}','true'::jsonb,true);
    END IF;
  END IF;
  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION private.cribbage_finish_discard(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cribbage_apply_discard(_round_id uuid,_player_id uuid,_card_indices integer[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_state jsonb; v_player public.players%ROWTYPE; v_ps jsonb; v_hand jsonb;
  v_discard jsonb:='[]'::jsonb; v_remaining jsonb:='[]'::jsonb; v_i integer; v_expected integer; v_count integer; v_all boolean:=true; v_key text;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_apply_discard:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_apply_discard:round_not_found'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_apply_discard:not_in_session'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=_player_id AND game_id=v_round.game_id;
  IF NOT FOUND OR (NOT v_service AND NOT coalesce(v_player.is_bot,false) AND v_player.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'cribbage_apply_discard:not_player_owner'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'<>'discarding' THEN RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid()); END IF;
  v_ps:=v_state->'playerStates'->_player_id::text;
  IF jsonb_array_length(coalesce(v_ps->'discardedToCrib','[]'::jsonb))>0 THEN RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid()); END IF;
  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates'); v_expected:=CASE WHEN v_count=2 THEN 2 ELSE 1 END;
  IF cardinality(_card_indices) IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'cribbage_apply_discard:invalid_count'; END IF;
  v_hand:=coalesce(v_ps->'hand','[]'::jsonb);
  FOR v_i IN 0..jsonb_array_length(v_hand)-1 LOOP IF v_i=ANY(_card_indices) THEN v_discard:=v_discard||jsonb_build_array(v_hand->v_i); ELSE v_remaining:=v_remaining||jsonb_build_array(v_hand->v_i); END IF; END LOOP;
  IF jsonb_array_length(v_discard)<>v_expected THEN RAISE EXCEPTION 'cribbage_apply_discard:invalid_indices'; END IF;
  v_ps:=jsonb_set(v_ps,'{hand}',v_remaining,true); v_ps:=jsonb_set(v_ps,'{discardedToCrib}',v_discard,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
  v_state:=jsonb_set(v_state,'{crib}',coalesce(v_state->'crib','[]'::jsonb)||v_discard,true);
  FOR v_key IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP IF jsonb_array_length(coalesce(v_state->'playerStates'->v_key->'discardedToCrib','[]'::jsonb))<>v_expected THEN v_all:=false; EXIT; END IF; END LOOP;
  IF v_all THEN v_state:=private.cribbage_finish_discard(v_state); END IF;
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_apply_discard(uuid,uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cribbage_apply_discard(uuid,uuid,integer[]) TO authenticated,service_role;

-- Full pegging/counting action helpers continue below in the companion
-- migration section. Keeping them in this migration makes the cutover atomic.

CREATE OR REPLACE FUNCTION private.cribbage_finish_match(p_state jsonb, p_winner_id text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog
AS $$
DECLARE
  v_state jsonb:=p_state; v_low integer; v_multiplier integer:=1;
BEGIN
  SELECT min(coalesce((value->>'pegScore')::integer,0)) INTO v_low
    FROM jsonb_each(v_state->'playerStates') WHERE key<>p_winner_id;
  IF coalesce((v_state->>'doubleSkunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'doubleSkunkThreshold')::integer,61) THEN v_multiplier:=3;
  ELSIF coalesce((v_state->>'skunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'skunkThreshold')::integer,91) THEN v_multiplier:=2; END IF;
  v_state:=jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
  v_state:=jsonb_set(v_state,'{winnerPlayerId}',to_jsonb(p_winner_id),true);
  v_state:=jsonb_set(v_state,'{loserScore}',to_jsonb(v_low),true);
  v_state:=jsonb_set(v_state,'{payoutMultiplier}',to_jsonb(v_multiplier),true);
  v_state:=jsonb_set(v_state,'{matchCompleteLatch}','true'::jsonb,true);
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_enter_counting(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private
AS $$
DECLARE
  v_state jsonb:=p_state; v_player_id text; v_dealer text:=p_state->>'dealerPlayerId';
  v_hand jsonb; v_score jsonb; v_player_scores jsonb:='{}'::jsonb; v_targets jsonb:='[]'::jsonb;
  v_baselines jsonb:='{}'::jsonb; v_crib_score jsonb; v_dealer_score jsonb; v_last_event jsonb;
BEGIN
  FOR v_player_id IN SELECT value#>>'{}' FROM jsonb_array_elements(v_state->'turnOrder') LOOP
    SELECT coalesce(jsonb_agg(play->'card' ORDER BY ordinality),'[]'::jsonb) INTO v_hand
      FROM jsonb_array_elements(v_state->'pegging'->'playedCards') WITH ORDINALITY played(play,ordinality)
     WHERE play->>'playerId'=v_player_id;
    v_score:=private.cribbage_hand_score(v_hand,v_state->'cutCard',false);
    v_player_scores:=jsonb_set(v_player_scores,ARRAY[v_player_id],v_score,true);
    v_baselines:=jsonb_set(v_baselines,ARRAY[v_player_id],to_jsonb(coalesce((v_state->'playerStates'->v_player_id->>'pegScore')::integer,0)),true);
    IF v_player_id<>v_dealer THEN
      v_targets:=v_targets||jsonb_build_array(jsonb_build_object('playerId',v_player_id,'type','hand',
        'comboPoints',private.cribbage_hand_combo_points(v_hand,v_state->'cutCard',false),'totalPoints',(v_score->>'total')::integer));
    ELSE v_dealer_score:=v_score; END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(play->'card' ORDER BY ordinality),'[]'::jsonb) INTO v_hand
    FROM jsonb_array_elements(v_state->'pegging'->'playedCards') WITH ORDINALITY played(play,ordinality)
   WHERE play->>'playerId'=v_dealer;
  v_targets:=v_targets||jsonb_build_array(jsonb_build_object('playerId',v_dealer,'type','hand',
    'comboPoints',private.cribbage_hand_combo_points(v_hand,v_state->'cutCard',false),'totalPoints',(v_dealer_score->>'total')::integer));
  v_crib_score:=private.cribbage_hand_score(v_state->'crib',v_state->'cutCard',true);
  v_targets:=v_targets||jsonb_build_array(jsonb_build_object('playerId',v_dealer,'type','crib',
    'comboPoints',private.cribbage_hand_combo_points(v_state->'crib',v_state->'cutCard',true),'totalPoints',(v_crib_score->>'total')::integer));
  v_last_event:=v_state->'lastEvent';
  IF coalesce(v_last_event->>'type','') NOT IN ('pegging_points','go_point') THEN
    v_last_event:=jsonb_build_object('id',gen_random_uuid(),'type','hand_count','playerId',v_dealer,'points',0,'label','Hands counted','createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  END IF;
  v_state:=jsonb_set(v_state,'{phase}','"counting"'::jsonb,true);
  v_state:=jsonb_set(v_state,'{countingStartedAt}',to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  v_state:=jsonb_set(v_state,'{countingHandKey}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{countingTargetIndex}','0'::jsonb,true);
  v_state:=jsonb_set(v_state,'{countingBeatIndex}','-1'::jsonb,true);
  v_state:=jsonb_set(v_state,'{countingPlan}',jsonb_build_object('version',1,'baselineScores',v_baselines,'targets',v_targets),true);
  v_state:=jsonb_set(v_state,'{countingResolution}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{winnerPlayerId}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{loserScore}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{payoutMultiplier}','1'::jsonb,true);
  v_state:=jsonb_set(v_state,'{lastHandCount}',jsonb_build_object('countedAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'playerHandScores',v_player_scores,'dealerHandScore',v_dealer_score,'cribScore',v_crib_score),true);
  v_state:=jsonb_set(v_state,'{lastEvent}',v_last_event,true);
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_advance_pegging(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private
AS $$
DECLARE
  v_state jsonb:=p_state; v_order jsonb:=p_state->'turnOrder'; v_len integer:=jsonb_array_length(p_state->'turnOrder');
  v_current text:=p_state->'pegging'->>'currentTurnPlayerId'; v_current_index integer:=0; v_i integer; v_candidate text;
  v_go jsonb:=coalesce(p_state->'pegging'->'goCalledBy','[]'::jsonb); v_last text:=p_state->'pegging'->>'lastToPlay';
  v_pending jsonb:=v_go; v_score integer; v_leader text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM jsonb_each(v_state->'playerStates') WHERE jsonb_array_length(coalesce(value->'hand','[]'::jsonb))>0) THEN
    RETURN private.cribbage_enter_counting(v_state);
  END IF;
  FOR v_i IN 0..v_len-1 LOOP IF v_order->>v_i=v_current THEN v_current_index:=v_i; EXIT; END IF; END LOOP;
  FOR v_i IN 1..v_len LOOP
    v_candidate:=v_order->>((v_current_index+v_i)%v_len);
    IF jsonb_array_length(coalesce(v_state->'playerStates'->v_candidate->'hand','[]'::jsonb))=0 THEN CONTINUE; END IF;
    IF v_go ? v_candidate THEN CONTINUE; END IF;
    IF NOT private.cribbage_has_playable(v_state->'playerStates'->v_candidate->'hand',(v_state->'pegging'->>'currentCount')::integer) THEN
      IF v_candidate IS DISTINCT FROM v_last THEN v_go:=v_go||jsonb_build_array(v_candidate); END IF;
      CONTINUE;
    END IF;
    v_state:=jsonb_set(v_state,'{pegging,goCalledBy}',v_go,true);
    v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',to_jsonb(v_candidate),true);
    RETURN v_state;
  END LOOP;
  v_pending:=v_go;
  IF v_last IS NOT NULL AND (v_state->'pegging'->>'currentCount')::integer>0 AND (v_state->'pegging'->>'currentCount')::integer<>31 THEN
    v_score:=coalesce((v_state->'playerStates'->v_last->>'pegScore')::integer,0)+1;
    v_state:=jsonb_set(v_state,ARRAY['playerStates',v_last,'pegScore'],to_jsonb(v_score),true);
    v_state:=jsonb_set(v_state,'{lastEvent}',jsonb_build_object('id',gen_random_uuid(),'type','go_point','playerId',v_last,'points',1,'label','Go','createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'count',(v_state->'pegging'->>'currentCount')::integer),true);
    IF v_score>=coalesce((v_state->>'pointsToWin')::integer,121) THEN RETURN private.cribbage_finish_match(v_state,v_last); END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_each(v_state->'playerStates') WHERE jsonb_array_length(coalesce(value->'hand','[]'::jsonb))>0) THEN RETURN private.cribbage_enter_counting(v_state); END IF;
  FOR v_i IN 0..v_len-1 LOOP IF v_order->>v_i=v_last THEN v_current_index:=v_i; EXIT; END IF; END LOOP;
  FOR v_i IN 1..v_len LOOP
    v_candidate:=v_order->>((v_current_index+v_i)%v_len);
    IF jsonb_array_length(coalesce(v_state->'playerStates'->v_candidate->'hand','[]'::jsonb))>0 THEN v_leader:=v_candidate; EXIT; END IF;
  END LOOP;
  v_state:=jsonb_set(v_state,'{pegging,currentCount}','0'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pegging,goCalledBy}','[]'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',to_jsonb(v_leader),true);
  v_state:=jsonb_set(v_state,'{pegging,lastToPlay}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pegging,sequenceStartIndex}',to_jsonb(jsonb_array_length(v_state->'pegging'->'playedCards')),true);
  IF jsonb_array_length(v_pending)>0 THEN v_state:=jsonb_set(v_state,'{pegging,pendingGoBubblePlayerIds}',v_pending,true); END IF;
  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION private.cribbage_finish_match(jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_enter_counting(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_advance_pegging(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cribbage_apply_pegging_action(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _card_index integer DEFAULT NULL,
  _expected_event_sequence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_player public.players%ROWTYPE; v_state jsonb; v_ps jsonb; v_hand jsonb;
  v_card jsonb; v_remaining jsonb:='[]'::jsonb; v_played jsonb; v_run jsonb; v_i integer; v_len integer; v_count integer; v_new_count integer;
  v_points integer:=0; v_pair_count integer:=1; v_pair_points integer:=0; v_run_points integer:=0; v_is_run boolean; v_min integer; v_max integer; v_distinct integer;
  v_last_card boolean; v_score integer; v_label text; v_seq integer; v_candidate text; v_current_index integer:=0;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role'; v_action text:=_action;
BEGIN
  IF auth.uid() IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:authentication_required'; END IF;
  IF v_action NOT IN ('play','go','auto') THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:invalid_action'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF v_game.game_type IS DISTINCT FROM 'cribbage' OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id OR v_game.total_hands IS DISTINCT FROM v_round.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:not_in_session'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=_player_id AND game_id=v_round.game_id;
  IF NOT FOUND OR (NOT v_service AND NOT coalesce(v_player.is_bot,false) AND v_player.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:not_player_owner'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'<>'pegging' OR v_state->'pegging'->>'currentTurnPlayerId'<>_player_id::text THEN
    RETURN jsonb_build_object('outcome','stale','state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()));
  END IF;
  v_seq:=coalesce((v_state->'pegging'->>'eventSequence')::integer,0);
  IF _expected_event_sequence IS NOT NULL AND _expected_event_sequence<>v_seq THEN
    RETURN jsonb_build_object('outcome','stale','event_sequence',v_seq,'state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()));
  END IF;
  v_ps:=v_state->'playerStates'->_player_id::text; v_hand:=coalesce(v_ps->'hand','[]'::jsonb);
  IF v_action='auto' THEN
    IF NOT coalesce(v_player.is_bot,false) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:auto_requires_bot'; END IF;
    SELECT item.ordinality::integer-1
      INTO _card_index
      FROM jsonb_array_elements(v_hand) WITH ORDINALITY item(card,ordinality)
     WHERE private.cribbage_card_value(item.card)+(v_state->'pegging'->>'currentCount')::integer<=31
     ORDER BY item.ordinality
     LIMIT 1;
    v_action:=CASE WHEN _card_index IS NULL THEN 'go' ELSE 'play' END;
  END IF;
  IF v_action='go' THEN
    IF private.cribbage_has_playable(v_hand,(v_state->'pegging'->>'currentCount')::integer) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:play_available'; END IF;
    IF NOT (coalesce(v_state->'pegging'->'goCalledBy','[]'::jsonb) ? _player_id::text) THEN
      v_state:=jsonb_set(v_state,'{pegging,goCalledBy}',coalesce(v_state->'pegging'->'goCalledBy','[]'::jsonb)||jsonb_build_array(_player_id::text),true);
      v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasCalledGo'],'true'::jsonb,true);
      v_state:=jsonb_set(v_state,'{pegging,eventSequence}',to_jsonb(v_seq+1),true);
    END IF;
    v_state:=private.cribbage_advance_pegging(v_state);
  ELSE
    IF _card_index IS NULL OR _card_index<0 OR _card_index>=jsonb_array_length(v_hand) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:invalid_card_index'; END IF;
    v_card:=v_hand->_card_index; v_count:=(v_state->'pegging'->>'currentCount')::integer; v_new_count:=v_count+private.cribbage_card_value(v_card);
    IF v_new_count>31 THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:exceeds_31'; END IF;
    FOR v_i IN 0..jsonb_array_length(v_hand)-1 LOOP IF v_i<>_card_index THEN v_remaining:=v_remaining||jsonb_build_array(v_hand->v_i); END IF; END LOOP;
    v_last_card:=jsonb_array_length(v_remaining)=0 AND NOT EXISTS(
      SELECT 1 FROM jsonb_each(v_state->'playerStates') entry
       WHERE entry.key<>_player_id::text AND jsonb_array_length(coalesce(entry.value->'hand','[]'::jsonb))>0);
    v_played:=coalesce(v_state->'pegging'->'playedCards','[]'::jsonb);
    SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO v_run
      FROM jsonb_array_elements(v_played) WITH ORDINALITY item(value,ordinality)
     WHERE ordinality>(coalesce((v_state->'pegging'->>'sequenceStartIndex')::integer,0));
    IF v_count<>0 AND jsonb_array_length(v_run)>0 THEN
      FOR v_i IN REVERSE jsonb_array_length(v_run)-1..0 LOOP EXIT WHEN v_run->v_i->'card'->>'rank'<>v_card->>'rank'; v_pair_count:=v_pair_count+1; END LOOP;
      IF v_pair_count>=2 THEN v_pair_points:=v_pair_count*(v_pair_count-1); END IF;
    END IF;
    FOR v_len IN REVERSE least(7,jsonb_array_length(v_run)+1)..3 LOOP
      SELECT min(private.cribbage_rank_value(card->>'rank')),max(private.cribbage_rank_value(card->>'rank')),count(DISTINCT private.cribbage_rank_value(card->>'rank'))
        INTO v_min,v_max,v_distinct FROM (
          SELECT value->'card' card FROM jsonb_array_elements(v_run) WITH ORDINALITY r(value,ordinality)
           WHERE ordinality>jsonb_array_length(v_run)-(v_len-1)
          UNION ALL SELECT v_card
        ) cards;
      IF v_distinct=v_len AND v_max-v_min=v_len-1 THEN v_run_points:=v_len; EXIT; END IF;
    END LOOP;
    v_points:=CASE WHEN v_new_count=15 THEN 2 ELSE 0 END+CASE WHEN v_new_count=31 THEN 2 ELSE 0 END+v_pair_points+v_run_points+CASE WHEN v_last_card AND v_new_count<>31 THEN 1 ELSE 0 END;
    v_score:=coalesce((v_ps->>'pegScore')::integer,0)+v_points;
    v_ps:=jsonb_set(v_ps,'{hand}',v_remaining,true); v_ps:=jsonb_set(v_ps,'{pegScore}',to_jsonb(v_score),true); v_ps:=jsonb_set(v_ps,'{hasCalledGo}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{pegging,playedCards}',v_played||jsonb_build_array(jsonb_build_object('playerId',_player_id,'card',v_card)),true);
    v_state:=jsonb_set(v_state,'{pegging,currentCount}',to_jsonb(v_new_count),true);
    v_state:=jsonb_set(v_state,'{pegging,eventSequence}',to_jsonb(v_seq+1),true);
    v_state:=jsonb_set(v_state,'{pegging,lastToPlay}',to_jsonb(_player_id::text),true);
    v_state:=v_state#-'{pegging,pendingGoBubblePlayerIds}';
    IF v_points>0 THEN
      v_label:=concat_ws(', ',CASE WHEN v_new_count=15 THEN '15 for 2' END,CASE WHEN v_new_count=31 THEN '31 for 2' END,
        CASE WHEN v_pair_points>0 THEN CASE v_pair_count WHEN 2 THEN 'Pair' WHEN 3 THEN 'Three of a Kind' ELSE 'Four of a Kind' END END,
        CASE WHEN v_run_points>0 THEN 'Run of '||v_run_points END,CASE WHEN v_last_card AND v_new_count<>31 THEN 'Last Card' END);
      v_state:=jsonb_set(v_state,'{lastEvent}',jsonb_build_object('id',gen_random_uuid(),'type','pegging_points','playerId',_player_id,'points',v_points,'label',v_label,'createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'count',v_new_count),true);
    END IF;
    IF v_score>=coalesce((v_state->>'pointsToWin')::integer,121) THEN v_state:=private.cribbage_finish_match(v_state,_player_id::text);
    ELSIF v_last_card THEN v_state:=private.cribbage_enter_counting(v_state);
    ELSIF v_new_count=31 THEN
      v_state:=jsonb_set(v_state,'{pegging,currentCount}','0'::jsonb,true); v_state:=jsonb_set(v_state,'{pegging,goCalledBy}','[]'::jsonb,true);
      v_state:=jsonb_set(v_state,'{pegging,lastToPlay}','null'::jsonb,true); v_state:=jsonb_set(v_state,'{pegging,sequenceStartIndex}',to_jsonb(jsonb_array_length(v_state->'pegging'->'playedCards')),true);
      FOR v_i IN 0..jsonb_array_length(v_state->'turnOrder')-1 LOOP
        IF v_state->'turnOrder'->>v_i=_player_id::text THEN v_current_index:=v_i; EXIT; END IF;
      END LOOP;
      FOR v_i IN 1..jsonb_array_length(v_state->'turnOrder') LOOP
        v_candidate:=v_state->'turnOrder'->>((v_current_index+v_i)%jsonb_array_length(v_state->'turnOrder'));
        IF jsonb_array_length(coalesce(v_state->'playerStates'->v_candidate->'hand','[]'::jsonb))>0 THEN EXIT; END IF;
        v_candidate:=NULL;
      END LOOP;
      v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',coalesce(to_jsonb(v_candidate),'null'::jsonb),true);
    ELSE v_state:=private.cribbage_advance_pegging(v_state); END IF;
  END IF;
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id;
  RETURN jsonb_build_object('outcome','applied','state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()),'event_sequence',coalesce((v_state->'pegging'->>'eventSequence')::integer,0));
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_apply_pegging_action(uuid,uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cribbage_apply_pegging_action(uuid,uuid,text,integer,integer) TO authenticated,service_role;

-- Preserve the already-proven settlement implementation behind a wrapper that
-- marks its round write as authoritative for the mutation guard above.
ALTER FUNCTION public.cribbage_settle_game(uuid,uuid,uuid,integer)
  RENAME TO cribbage_settle_game_authority_impl;

REVOKE ALL ON FUNCTION public.cribbage_settle_game_authority_impl(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.cribbage_settle_game(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
BEGIN
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  RETURN public.cribbage_settle_game_authority_impl(
    p_game_id,p_round_id,p_dealer_game_id,p_hand_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_settle_game(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cribbage_settle_game(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.advance_due_cribbage_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_candidate record;
  v_advanced integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_candidate IN
    SELECT game_row.id AS game_id
      FROM public.games game_row
     WHERE game_row.game_type='cribbage'
       AND game_row.status='cribbage_dealer_selection'
       AND game_row.dealer_selection_state->>'isComplete'='true'
       AND nullif(game_row.dealer_selection_state->>'preparedAt','')::timestamptz
             <=clock_timestamp()-interval '5 seconds'
     ORDER BY nullif(game_row.dealer_selection_state->>'preparedAt','')::timestamptz,game_row.id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.start_cribbage_initial_hand(v_candidate.game_id);
      v_advanced:=v_advanced+1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT authority.round_id,
           participant.id AS player_id,
           CASE WHEN jsonb_object_length(authority.state->'playerStates')=2
                THEN ARRAY[0,1]::integer[] ELSE ARRAY[0]::integer[] END AS card_indices
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant ON participant.game_id=round_row.game_id
     WHERE authority.state->>'phase'='discarding'
       AND coalesce(participant.is_bot,false)
       AND authority.state->'playerStates' ? participant.id::text
       AND jsonb_array_length(coalesce(authority.state->'playerStates'->participant.id::text->'discardedToCrib','[]'::jsonb))=0
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
     ORDER BY authority.updated_at,authority.round_id,participant.position
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_apply_discard(
        v_candidate.round_id,v_candidate.player_id,v_candidate.card_indices
      );
      v_advanced:=v_advanced+1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT authority.round_id,
           nullif(authority.state->'pegging'->>'currentTurnPlayerId','')::uuid AS player_id,
           coalesce((authority.state->'pegging'->>'eventSequence')::integer,0) AS event_sequence
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant
        ON participant.id=nullif(authority.state->'pegging'->>'currentTurnPlayerId','')::uuid
       AND participant.game_id=round_row.game_id
     WHERE authority.state->>'phase'='pegging'
       AND coalesce(participant.is_bot,false)
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
     ORDER BY authority.updated_at,authority.round_id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_apply_pegging_action(
        v_candidate.round_id,
        v_candidate.player_id,
        'auto',
        NULL,
        v_candidate.event_sequence
      );
      v_advanced:=v_advanced+1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT round_row.id AS round_id
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE authority.state->>'phase'='counting'
       AND authority.state->'countingResolution'->>'outcome'='ready'
       AND round_row.presentation_fallback_at<=clock_timestamp()
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
     ORDER BY round_row.presentation_fallback_at,round_row.id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_release_counting(v_candidate.round_id,true);
      v_advanced:=v_advanced+1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,
           round_row.dealer_game_id,round_row.hand_number
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE authority.state->>'phase'='complete'
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
       AND game_row.status NOT IN ('game_over','session_ended')
     ORDER BY authority.updated_at,round_row.id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_settle_game(
        v_candidate.game_id,v_candidate.round_id,
        v_candidate.dealer_game_id,v_candidate.hand_number
      );
      v_advanced:=v_advanced+1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN v_advanced;
END;
$$;

REVOKE ALL ON FUNCTION private.advance_due_cribbage_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_cribbage_state() TO service_role;

CREATE OR REPLACE FUNCTION public.cribbage_finalize_counting(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_state jsonb; v_actor uuid:=auth.uid();
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role'; v_count integer; v_i integer; v_player_id text; v_dealer text;
  v_hand jsonb; v_score jsonb; v_total integer; v_new_score integer; v_winner text; v_plan jsonb; v_combo_count integer;
  v_presentation_ms integer:=3000; v_fallback_at timestamptz; v_resolution jsonb;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_finalize_counting:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN RAISE EXCEPTION 'cribbage_finalize_counting:not_cribbage_round'; END IF;
  IF NOT v_service AND (v_actor IS NULL OR (NOT public.user_is_in_game(v_round.game_id) AND NOT public.has_role(v_actor,'admin'::public.app_role))) THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'='complete' THEN RETURN jsonb_build_object('outcome','terminal','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),'deduped',true); END IF;
  IF v_state->>'phase'<>'counting' THEN RETURN jsonb_build_object('outcome','rejected','reason','round_not_counting'); END IF;
  IF v_state->'countingResolution'->>'outcome'='ready' THEN
    RETURN jsonb_build_object('outcome','ready','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),'presentation_release_at',v_round.presentation_fallback_at-interval '5 seconds','deduped',true);
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id OR v_game.total_hands IS DISTINCT FROM v_round.hand_number OR coalesce(v_game.is_paused,false) OR v_game.status IN ('game_over','session_ended') THEN
    RETURN jsonb_build_object('outcome','rejected','reason','stale_or_inactive');
  END IF;
  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates');
  IF v_count<2 OR v_count>4 OR jsonb_array_length(v_state->'turnOrder')<>v_count THEN RAISE EXCEPTION 'cribbage_finalize_counting:invalid_cohort'; END IF;
  IF EXISTS(
    (SELECT player_key::uuid FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key))
    EXCEPT
    (SELECT id FROM public.players WHERE game_id=v_round.game_id AND NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left'))
  ) OR EXISTS(
    (SELECT id FROM public.players WHERE game_id=v_round.game_id AND NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left'))
    EXCEPT
    (SELECT player_key::uuid FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key))
  ) THEN RAISE EXCEPTION 'cribbage_finalize_counting:player_cohort_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(v_state->'playerStates') WHERE jsonb_array_length(coalesce(value->'hand','[]'::jsonb))<>0) THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:pegging_incomplete';
  END IF;
  v_dealer:=v_state->>'dealerPlayerId'; v_plan:=v_state->'countingPlan';
  FOR v_i IN 0..v_count LOOP
    IF v_i<v_count-1 THEN v_player_id:=v_state->'turnOrder'->>v_i;
    ELSE v_player_id:=v_dealer; END IF;
    IF v_i=v_count THEN
      v_hand:=v_state->'crib'; v_score:=private.cribbage_hand_score(v_hand,v_state->'cutCard',true);
    ELSE
      SELECT coalesce(jsonb_agg(play->'card' ORDER BY ordinality),'[]'::jsonb) INTO v_hand
        FROM jsonb_array_elements(v_state->'pegging'->'playedCards') WITH ORDINALITY played(play,ordinality)
       WHERE play->>'playerId'=v_player_id;
      IF jsonb_array_length(v_hand)<>4 THEN RAISE EXCEPTION 'cribbage_finalize_counting:invalid_hand:%',v_player_id; END IF;
      v_score:=private.cribbage_hand_score(v_hand,v_state->'cutCard',false);
    END IF;
    v_total:=(v_score->>'total')::integer;
    v_combo_count:=jsonb_array_length(private.cribbage_hand_combo_points(v_hand,v_state->'cutCard',v_i=v_count));
    v_presentation_ms:=v_presentation_ms+800+500+1500+CASE WHEN v_combo_count=0 THEN 1000 ELSE v_combo_count*2000+1500 END;
    v_new_score:=coalesce((v_state->'playerStates'->v_player_id->>'pegScore')::integer,0)+v_total;
    v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_id,'pegScore'],to_jsonb(v_new_score),true);
    -- Replace any browser/backfilled plan totals with the independently derived value.
    IF jsonb_typeof(v_plan->'targets')='array' AND jsonb_array_length(v_plan->'targets')>v_i THEN
      v_plan:=jsonb_set(v_plan,ARRAY['targets',v_i::text,'comboPoints'],private.cribbage_hand_combo_points(v_hand,v_state->'cutCard',v_i=v_count),true);
      v_plan:=jsonb_set(v_plan,ARRAY['targets',v_i::text,'totalPoints'],to_jsonb(v_total),true);
    END IF;
    IF v_new_score>=coalesce(v_game.points_to_win,(v_state->>'pointsToWin')::integer,121) THEN v_winner:=v_player_id; EXIT; END IF;
  END LOOP;
  v_state:=jsonb_set(v_state,'{countingPlan}',v_plan,true);
  IF v_winner IS NOT NULL THEN
    v_state:=private.cribbage_finish_match(v_state,v_winner);
    v_resolution:=jsonb_build_object('version',3,'outcome','terminal','resolvedAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    v_state:=jsonb_set(v_state,'{countingResolution}',v_resolution,true);
    PERFORM private.cribbage_publish_state(_round_id,v_state);
    PERFORM set_config('app.cribbage_authoritative_write','on',true);
    UPDATE public.rounds SET presentation_fallback_at=NULL WHERE id=_round_id;
    RETURN jsonb_build_object('outcome','terminal','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),'deduped',false);
  END IF;
  v_fallback_at:=clock_timestamp()+make_interval(secs=>ceil((v_presentation_ms+5000)::numeric/1000)::integer);
  v_resolution:=jsonb_build_object('version',3,'outcome','ready','successorHandNumber',coalesce(v_round.hand_number,0)+1,
    'presentationReleaseAt',to_char((v_fallback_at-interval '5 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'presentationFallbackAt',to_char(v_fallback_at AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'resolvedAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  v_state:=jsonb_set(v_state,'{countingResolution}',v_resolution,true);
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.rounds SET presentation_fallback_at=v_fallback_at WHERE id=_round_id;
  RETURN jsonb_build_object('outcome','ready','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),
    'presentation_release_at',v_fallback_at-interval '5 seconds','presentation_fallback_at',v_fallback_at,'deduped',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_release_counting(_round_id uuid,_from_fallback boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_existing public.rounds%ROWTYPE; v_state jsonb; v_next jsonb;
  v_actor uuid:=auth.uid(); v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role'; v_ids uuid[]; v_count integer;
  v_next_dealer uuid; v_next_dealer_position integer; v_deck jsonb; v_next_round uuid; v_player_id uuid; v_release_at timestamptz;
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_release_counting:authentication_required'; END IF;
  IF _from_fallback AND NOT v_service THEN RAISE EXCEPTION 'cribbage_release_counting:fallback_requires_service_role'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_release_counting:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN RAISE EXCEPTION 'cribbage_release_counting:not_in_session'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'='complete' THEN RETURN jsonb_build_object('outcome','terminal','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),'deduped',true); END IF;
  SELECT * INTO v_existing FROM public.rounds WHERE predecessor_round_id=_round_id LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('outcome','already_active','round_id',v_existing.id,'hand_number',v_existing.hand_number,'deduped',true); END IF;
  IF v_game.game_type IS DISTINCT FROM 'cribbage' OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_round.status IS DISTINCT FROM 'betting' OR v_state->>'phase'<>'counting' OR v_state->'countingResolution'->>'outcome'<>'ready' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','counting_not_ready');
  END IF;
  IF v_round.presentation_fallback_at IS NULL THEN RETURN jsonb_build_object('outcome','rejected','reason','presentation_lease_missing'); END IF;
  v_release_at:=v_round.presentation_fallback_at-interval '5 seconds';
  IF (_from_fallback AND v_round.presentation_fallback_at>clock_timestamp()) OR (NOT _from_fallback AND v_release_at>clock_timestamp()) THEN
    RETURN jsonb_build_object('outcome','presentation_pending','hand_number',v_round.hand_number+1,'presentation_release_at',v_release_at,'presentation_fallback_at',v_round.presentation_fallback_at,'deduped',true);
  END IF;
  SELECT array_agg(id ORDER BY position),count(*)::integer INTO v_ids,v_count FROM public.players
   WHERE game_id=v_round.game_id AND NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left');
  v_next_dealer:=(v_state->'turnOrder'->>0)::uuid;
  IF v_next_dealer IS NULL OR NOT (v_next_dealer=ANY(v_ids)) THEN RAISE EXCEPTION 'cribbage_release_counting:invalid_next_dealer'; END IF;
  SELECT position INTO v_next_dealer_position FROM public.players WHERE id=v_next_dealer AND game_id=v_round.game_id;
  v_deck:=private.cribbage_new_deck(); v_next:=private.cribbage_initial_state(v_game,v_ids,v_next_dealer,v_deck);
  FOREACH v_player_id IN ARRAY v_ids LOOP
    v_next:=jsonb_set(v_next,ARRAY['playerStates',v_player_id::text,'pegScore'],to_jsonb(coalesce((v_state->'playerStates'->v_player_id::text->>'pegScore')::integer,0)),true);
  END LOOP;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,cribbage_state,predecessor_round_id)
  VALUES(v_round.game_id,v_round.dealer_game_id,1,v_round.hand_number+1,CASE WHEN v_count=2 THEN 6 ELSE 5 END,0,'betting',private.cribbage_public_state(v_next),v_round.id)
  RETURNING id INTO v_next_round;
  INSERT INTO private.cribbage_round_states(round_id,state) VALUES(v_next_round,v_next);
  FOREACH v_player_id IN ARRAY v_ids LOOP
    INSERT INTO public.player_cards(player_id,round_id,cards) VALUES(v_player_id,v_next_round,v_next->'playerStates'->v_player_id::text->'hand')
    ON CONFLICT(player_id,round_id) DO UPDATE SET cards=EXCLUDED.cards;
  END LOOP;
  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL,presentation_fallback_at=NULL WHERE id=v_round.id;
  UPDATE public.games SET status='in_progress',dealer_position=v_next_dealer_position,current_round=1,total_hands=v_round.hand_number+1,is_first_hand=false,pot=0 WHERE id=v_round.game_id;
  RETURN jsonb_build_object('outcome','activated','round_id',v_next_round,'hand_number',v_round.hand_number+1,'deduped',false,'from_fallback',_from_fallback);
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_complete_counting(_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.cribbage_finalize_counting(_round_id);
  IF v_result->>'outcome'='terminal' THEN RETURN v_result; END IF;
  RETURN public.cribbage_release_counting(_round_id,false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_record_counting_progress(_round_id uuid,_target_index integer,_beat_index integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE v_round public.rounds%ROWTYPE; v_state jsonb; v_current_target integer; v_current_beat integer; v_target_count integer; v_combo_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'cribbage_record_counting_progress:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_record_counting_progress:not_in_session'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'<>'counting' THEN RETURN jsonb_build_object('outcome','rejected','reason','round_not_counting'); END IF;
  v_target_count:=jsonb_array_length(v_state->'countingPlan'->'targets');
  IF _target_index<0 OR _target_index>=v_target_count OR _beat_index< -1 THEN RETURN jsonb_build_object('outcome','rejected','reason','cursor_out_of_range'); END IF;
  v_combo_count:=jsonb_array_length(v_state->'countingPlan'->'targets'->_target_index->'comboPoints');
  IF _beat_index>v_combo_count THEN RETURN jsonb_build_object('outcome','rejected','reason','beat_out_of_range'); END IF;
  v_current_target:=coalesce((v_state->>'countingTargetIndex')::integer,0); v_current_beat:=coalesce((v_state->>'countingBeatIndex')::integer,-1);
  IF _target_index<v_current_target OR (_target_index=v_current_target AND _beat_index<=v_current_beat) THEN RETURN jsonb_build_object('outcome','ignored','state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid())); END IF;
  v_state:=jsonb_set(v_state,'{countingTargetIndex}',to_jsonb(_target_index),true); v_state:=jsonb_set(v_state,'{countingBeatIndex}',to_jsonb(_beat_index),true);
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  RETURN jsonb_build_object('outcome','advanced','state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_reconcile_discard_transition(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE v_round public.rounds%ROWTYPE; v_state jsonb; v_count integer; v_expected integer; v_all boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'cribbage_reconcile_discard_transition:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_reconcile_discard_transition:not_in_session'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'='discarding' THEN
    SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates'); v_expected:=CASE WHEN v_count=2 THEN 2 ELSE 1 END;
    SELECT bool_and(jsonb_array_length(coalesce(value->'discardedToCrib','[]'::jsonb))=v_expected) INTO v_all FROM jsonb_each(v_state->'playerStates');
    IF coalesce(v_all,false) AND jsonb_array_length(v_state->'crib')=v_count*v_expected THEN v_state:=private.cribbage_finish_discard(v_state); PERFORM private.cribbage_publish_state(_round_id,v_state); END IF;
  END IF;
  RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_finalize_counting(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cribbage_release_counting(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cribbage_complete_counting(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cribbage_record_counting_progress(uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cribbage_reconcile_discard_transition(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cribbage_finalize_counting(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_release_counting(uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_complete_counting(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_record_counting_progress(uuid,integer,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_reconcile_discard_transition(uuid) TO authenticated,service_role;

CREATE TRIGGER cribbage_finish_counting_handoff
AFTER UPDATE OF cribbage_state ON public.rounds
FOR EACH ROW
EXECUTE FUNCTION public.cribbage_finish_counting_handoff();

DO $schedule$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid FROM cron.job WHERE jobname='advance-due-cribbage-state-1s'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'advance-due-cribbage-state-1s',
    '1 second',
    $cron$SELECT private.advance_due_cribbage_state();$cron$
  );
END;
$schedule$;

COMMENT ON TABLE private.cribbage_round_states IS 'Server-owned Cribbage state including hidden hands and crib cards. Clients receive only caller-specific projections.';
COMMENT ON FUNCTION public.cribbage_apply_pegging_action(uuid,uuid,text,integer,integer) IS 'Locks the exact Cribbage hand and derives one legal play/Go, score, turn, run reset, counting entry, or terminal state.';
COMMENT ON FUNCTION public.start_cribbage_initial_hand(uuid) IS 'Replay-safe server-owned Cribbage first-hand deal and publication.';
COMMENT ON FUNCTION private.advance_due_cribbage_state() IS 'Disconnect-safe owner for bot discards, bot pegging, expired counting leases, and terminal settlement.';
