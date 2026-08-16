-- Gin Rummy authority cutover.
--
-- Hidden cards and gameplay truth move to a private row-locked state owner.
-- Public rounds retain only a redacted realtime projection. Browsers submit
-- exact identity plus intent; PostgreSQL derives every legal transition.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.gin_rummy_round_states (
  round_id uuid PRIMARY KEY REFERENCES public.rounds(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE private.gin_rummy_round_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.gin_rummy_round_states FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gin_card(_rank text, _suit text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'rank', _rank,
    'suit', _suit,
    'value', CASE
      WHEN _rank = 'A' THEN 1
      WHEN _rank IN ('J', 'Q', 'K') THEN 10
      ELSE _rank::integer
    END
  );
$$;

CREATE OR REPLACE FUNCTION private.gin_card_key(_card jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT coalesce(_card->>'rank', '') || ':' || coalesce(_card->>'suit', '');
$$;

CREATE OR REPLACE FUNCTION private.gin_mask_cards(_cards jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('rank', '?', 'suit', '?', 'value', 0, 'masked', true)
      ORDER BY card.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(coalesce(_cards, '[]'::jsonb))
       WITH ORDINALITY AS card(value, ordinality);
$$;

CREATE OR REPLACE FUNCTION private.gin_public_state(_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_state jsonb := _state;
  v_player_id text;
  v_reveal boolean := coalesce(_state->>'phase', '') IN (
    'knocking', 'laying_off', 'scoring', 'complete'
  );
BEGIN
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RETURN v_state;
  END IF;

  FOR v_player_id IN
    SELECT jsonb_object_keys(coalesce(v_state->'playerStates', '{}'::jsonb))
  LOOP
    IF NOT v_reveal THEN
      v_state := jsonb_set(
        v_state,
        ARRAY['playerStates', v_player_id, 'hand'],
        private.gin_mask_cards(v_state->'playerStates'->v_player_id->'hand'),
        true
      );
    END IF;
  END LOOP;

  v_state := jsonb_set(
    v_state,
    '{stockPile}',
    private.gin_mask_cards(v_state->'stockPile'),
    true
  );
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_project_state(
  _state jsonb,
  _game_id uuid,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_state jsonb := private.gin_public_state(_state);
  v_player_id uuid;
BEGIN
  IF _actor_id IS NULL OR _state IS NULL THEN
    RETURN v_state;
  END IF;

  SELECT participant.id
    INTO v_player_id
    FROM public.players participant
   WHERE participant.game_id = _game_id
     AND participant.user_id = _actor_id
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  IF v_player_id IS NOT NULL AND _state->'playerStates' ? v_player_id::text THEN
    v_state := jsonb_set(
      v_state,
      ARRAY['playerStates', v_player_id::text, 'hand'],
      coalesce(_state->'playerStates'->v_player_id::text->'hand', '[]'::jsonb),
      true
    );
  END IF;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_new_deck()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, private
AS $$
  WITH deck AS (
    SELECT private.gin_card(rank, suit) AS card, random() AS shuffle_key
      FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key) FROM deck;
$$;

CREATE OR REPLACE FUNCTION private.gin_array_pop(_cards jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(card.value ORDER BY card.ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(_cards, '[]'::jsonb))
         WITH ORDINALITY AS card(value, ordinality)
   WHERE card.ordinality < jsonb_array_length(coalesce(_cards, '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION private.gin_remove_cards(_hand jsonb, _cards jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
  SELECT coalesce(jsonb_agg(hand_card.value ORDER BY hand_card.ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(_hand, '[]'::jsonb))
         WITH ORDINALITY AS hand_card(value, ordinality)
   WHERE NOT EXISTS (
     SELECT 1
       FROM jsonb_array_elements(coalesce(_cards, '[]'::jsonb)) remove_card(value)
      WHERE private.gin_card_key(remove_card.value) = private.gin_card_key(hand_card.value)
   );
$$;

CREATE OR REPLACE FUNCTION private.gin_find_card(_hand jsonb, _requested jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
  SELECT card.value
    FROM jsonb_array_elements(coalesce(_hand, '[]'::jsonb)) card(value)
   WHERE private.gin_card_key(card.value) = private.gin_card_key(_requested)
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.gin_deadwood_value(_cards jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(sum((card.value->>'value')::integer), 0)::integer
    FROM jsonb_array_elements(coalesce(_cards, '[]'::jsonb)) card(value);
$$;

CREATE OR REPLACE FUNCTION private.gin_meld_type(_cards jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer := jsonb_array_length(coalesce(_cards, '[]'::jsonb));
  v_rank_count integer;
  v_suit_count integer;
  v_min integer;
  v_max integer;
  v_distinct_ranks integer;
BEGIN
  IF v_count < 3 THEN RETURN NULL; END IF;
  SELECT count(DISTINCT card.value->>'rank'),
         count(DISTINCT card.value->>'suit'),
         count(DISTINCT CASE card.value->>'rank'
           WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
           ELSE (card.value->>'rank')::integer END),
         min(CASE card.value->>'rank'
           WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
           ELSE (card.value->>'rank')::integer END),
         max(CASE card.value->>'rank'
           WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
           ELSE (card.value->>'rank')::integer END)
    INTO v_rank_count, v_suit_count, v_distinct_ranks, v_min, v_max
    FROM jsonb_array_elements(_cards) card(value);
  IF v_rank_count = 1 AND v_count IN (3,4) THEN RETURN 'set'; END IF;
  IF v_suit_count = 1 AND v_distinct_ranks = v_count AND v_max - v_min + 1 = v_count THEN
    RETURN 'run';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_all_melds(_hand jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_count integer := jsonb_array_length(coalesce(_hand, '[]'::jsonb));
  v_mask integer;
  v_index integer;
  v_cards jsonb;
  v_type text;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_count < 3 THEN RETURN v_result; END IF;
  FOR v_mask IN 1..(power(2, v_count)::integer - 1) LOOP
    v_cards := '[]'::jsonb;
    FOR v_index IN 0..v_count - 1 LOOP
      IF (v_mask & (1 << v_index)) <> 0 THEN
        v_cards := v_cards || jsonb_build_array(_hand->v_index);
      END IF;
    END LOOP;
    v_type := private.gin_meld_type(v_cards);
    IF v_type IS NOT NULL THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object('type', v_type, 'cards', v_cards));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_optimal_grouping(_hand jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_best_deadwood jsonb := coalesce(_hand, '[]'::jsonb);
  v_best_value integer := private.gin_deadwood_value(v_best_deadwood);
  v_best_melds jsonb := '[]'::jsonb;
  v_meld jsonb;
  v_remaining jsonb;
  v_child jsonb;
  v_child_value integer;
BEGIN
  IF jsonb_array_length(coalesce(_hand, '[]'::jsonb)) < 3 OR v_best_value = 0 THEN
    RETURN jsonb_build_object('melds', v_best_melds, 'deadwood', v_best_deadwood, 'deadwoodValue', v_best_value);
  END IF;
  FOR v_meld IN SELECT value FROM jsonb_array_elements(private.gin_all_melds(_hand)) LOOP
    v_remaining := private.gin_remove_cards(_hand, v_meld->'cards');
    v_child := private.gin_optimal_grouping(v_remaining);
    v_child_value := coalesce((v_child->>'deadwoodValue')::integer, 0);
    IF v_child_value < v_best_value THEN
      v_best_value := v_child_value;
      v_best_deadwood := v_child->'deadwood';
      v_best_melds := jsonb_build_array(v_meld) || coalesce(v_child->'melds', '[]'::jsonb);
      EXIT WHEN v_best_value = 0;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('melds', v_best_melds, 'deadwood', v_best_deadwood, 'deadwoodValue', v_best_value);
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_can_lay_off(_card jsonb, _meld jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer := jsonb_array_length(coalesce(_meld->'cards', '[]'::jsonb));
  v_card_rank integer;
  v_min integer;
  v_max integer;
BEGIN
  IF _meld->>'type' = 'set' THEN
    RETURN v_count < 4
      AND _card->>'rank' = _meld->'cards'->0->>'rank'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(_meld->'cards') member(value)
         WHERE member.value->>'suit' = _card->>'suit'
      );
  END IF;
  IF _meld->>'type' <> 'run' OR v_count < 3
     OR _card->>'suit' IS DISTINCT FROM _meld->'cards'->0->>'suit' THEN
    RETURN false;
  END IF;
  v_card_rank := CASE _card->>'rank'
    WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
    ELSE (_card->>'rank')::integer END;
  SELECT min(CASE member.value->>'rank'
           WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
           ELSE (member.value->>'rank')::integer END),
         max(CASE member.value->>'rank'
           WHEN 'A' THEN 1 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
           ELSE (member.value->>'rank')::integer END)
    INTO v_min, v_max
    FROM jsonb_array_elements(_meld->'cards') member(value);
  RETURN v_card_rank = v_min - 1 OR v_card_rank = v_max + 1;
END;
$$;

REVOKE ALL ON FUNCTION private.gin_card(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_card_key(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_mask_cards(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_public_state(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_project_state(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_new_deck() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_array_pop(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_remove_cards(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_find_card(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_deadwood_value(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_meld_type(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_all_melds(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_optimal_grouping(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_can_lay_off(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.gin_publish_state(_round_id uuid, _state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_player_id text;
BEGIN
  INSERT INTO private.gin_rummy_round_states(round_id, state, version, updated_at)
  VALUES (_round_id, _state, 1, clock_timestamp())
  ON CONFLICT (round_id) DO UPDATE
    SET state = EXCLUDED.state,
        version = private.gin_rummy_round_states.version + 1,
        updated_at = clock_timestamp();

  PERFORM set_config('app.gin_rummy_authoritative_write', 'on', true);
  UPDATE public.rounds
     SET gin_rummy_state = private.gin_public_state(_state)
   WHERE id = _round_id;

  FOR v_player_id IN SELECT jsonb_object_keys(coalesce(_state->'playerStates', '{}'::jsonb)) LOOP
    INSERT INTO public.player_cards(player_id, round_id, cards)
    VALUES (v_player_id::uuid, _round_id, coalesce(_state->'playerStates'->v_player_id->'hand', '[]'::jsonb))
    ON CONFLICT (player_id, round_id) DO UPDATE
      SET cards = EXCLUDED.cards,
          source_version = public.player_cards.source_version + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.gin_publish_state(uuid,jsonb) FROM PUBLIC,anon,authenticated;

-- Capture legacy states before replacing the public document with a redacted projection.
INSERT INTO private.gin_rummy_round_states(round_id, state)
SELECT round_row.id, round_row.gin_rummy_state
  FROM public.rounds round_row
  JOIN public.games game_row ON game_row.id = round_row.game_id
 WHERE game_row.game_type = 'gin-rummy'
   AND round_row.gin_rummy_state IS NOT NULL
ON CONFLICT (round_id) DO NOTHING;

SELECT set_config('app.gin_rummy_authoritative_write', 'on', true);
UPDATE public.rounds round_row
   SET gin_rummy_state = private.gin_public_state(authority.state)
  FROM private.gin_rummy_round_states authority
 WHERE authority.round_id = round_row.id
   AND round_row.gin_rummy_state IS DISTINCT FROM private.gin_public_state(authority.state);

CREATE OR REPLACE FUNCTION private.gin_guard_round_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game_id uuid;
  v_is_gin boolean := false;
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_trusted boolean := coalesce(current_setting('app.gin_rummy_authoritative_write',true),'') = 'on';
BEGIN
  v_game_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  SELECT EXISTS(SELECT 1 FROM public.games WHERE id=v_game_id AND game_type='gin-rummy') INTO v_is_gin;
  IF TG_OP='UPDATE' AND NOT v_is_gin THEN
    SELECT EXISTS(SELECT 1 FROM public.games WHERE id=OLD.game_id AND game_type='gin-rummy') INTO v_is_gin;
  END IF;
  IF v_is_gin AND NOT v_service AND NOT v_trusted THEN
    RAISE EXCEPTION 'gin_rummy_round_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS gin_rummy_guard_round_insert ON public.rounds;
CREATE TRIGGER gin_rummy_guard_round_insert BEFORE INSERT ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.gin_guard_round_mutation();
DROP TRIGGER IF EXISTS gin_rummy_guard_round_update ON public.rounds;
CREATE TRIGGER gin_rummy_guard_round_update BEFORE UPDATE ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.gin_guard_round_mutation();
DROP TRIGGER IF EXISTS gin_rummy_guard_round_delete ON public.rounds;
CREATE TRIGGER gin_rummy_guard_round_delete BEFORE DELETE ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.gin_guard_round_mutation();

CREATE OR REPLACE FUNCTION private.gin_guard_player_cards_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_round_id uuid := CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
  v_is_gin boolean := false;
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_trusted boolean := coalesce(current_setting('app.gin_rummy_authoritative_write',true),'')='on';
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.rounds r JOIN public.games g ON g.id=r.game_id
     WHERE r.id=v_round_id AND g.game_type='gin-rummy'
  ) INTO v_is_gin;
  IF TG_OP='UPDATE' AND NOT v_is_gin THEN
    SELECT EXISTS(
      SELECT 1 FROM public.rounds r JOIN public.games g ON g.id=r.game_id
       WHERE r.id=OLD.round_id AND g.game_type='gin-rummy'
    ) INTO v_is_gin;
  END IF;
  IF v_is_gin AND NOT v_service AND NOT v_trusted THEN
    RAISE EXCEPTION 'gin_rummy_player_cards_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS gin_rummy_guard_player_cards_mutation ON public.player_cards;
CREATE TRIGGER gin_rummy_guard_player_cards_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.player_cards
FOR EACH ROW EXECUTE FUNCTION private.gin_guard_player_cards_mutation();

CREATE OR REPLACE FUNCTION private.gin_guard_game_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_trusted boolean := coalesce(current_setting('app.gin_rummy_authoritative_write',true),'')='on';
BEGIN
  IF (OLD.game_type='gin-rummy' OR NEW.game_type='gin-rummy')
     AND NOT v_service AND NOT v_trusted
     AND (
       (NEW.status='in_progress' AND OLD.status IS DISTINCT FROM 'in_progress')
       OR OLD.status IN ('in_progress','game_over')
       OR NEW.status IN ('game_over','session_ended')
     ) THEN
    RAISE EXCEPTION 'gin_rummy_game_authority_mutation:rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gin_rummy_guard_game_authority ON public.games;
CREATE TRIGGER gin_rummy_guard_game_authority
BEFORE UPDATE OF status,dealer_position,current_round,total_hands,current_game_uuid ON public.games
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.dealer_position IS DISTINCT FROM NEW.dealer_position
  OR OLD.current_round IS DISTINCT FROM NEW.current_round
  OR OLD.total_hands IS DISTINCT FROM NEW.total_hands
  OR OLD.current_game_uuid IS DISTINCT FROM NEW.current_game_uuid
)
EXECUTE FUNCTION private.gin_guard_game_authority();

REVOKE ALL ON FUNCTION private.gin_guard_round_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_guard_player_cards_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_guard_game_authority() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gin_rummy_get_state(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'gin_rummy_get_state:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_get_state:round_not_found'; END IF;
  IF NOT v_service
     AND NOT public.user_is_in_game(v_round.game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_get_state:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_rummy_get_state:state_not_found'; END IF;
  RETURN private.gin_project_state(v_state,v_round.game_id,v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.gin_rummy_get_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gin_rummy_get_state(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.gin_deck_without(_used jsonb)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, private
AS $$
  WITH deck AS (
    SELECT private.gin_card(rank, suit) AS card, random() AS shuffle_key
      FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
  )
  SELECT coalesce(jsonb_agg(deck.card ORDER BY deck.shuffle_key), '[]'::jsonb)
    FROM deck
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(_used,'[]'::jsonb)) used(value)
      WHERE private.gin_card_key(used.value)=private.gin_card_key(deck.card)
   );
$$;

CREATE OR REPLACE FUNCTION private.gin_deal_state(
  _game public.games,
  _dealer_id uuid,
  _nondealer_id uuid,
  _match_scores jsonb,
  _hand_number integer,
  _points_to_win integer,
  _ante_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_deck jsonb := private.gin_new_deck();
  v_dealer_hand jsonb;
  v_nondealer_hand jsonb;
  v_up_card jsonb;
  v_stock jsonb;
  v_used jsonb;
  v_harness text := 'none';
  v_harness_enabled boolean := false;
  v_target_id uuid;
  v_target_hand jsonb;
  v_other_hand jsonb;
BEGIN
  SELECT coalesce(defaults.debug_harness,'none') INTO v_harness
    FROM public.game_defaults defaults WHERE defaults.game_type='gin-rummy' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled
    FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
  IF NOT coalesce(v_harness_enabled,false) THEN v_harness := 'none'; END IF;
  IF v_harness='opponent_instant_knock' THEN v_harness:='non_dealer_near_knock'; END IF;

  IF v_harness='non_dealer_near_knock' THEN
    v_nondealer_hand := jsonb_build_array(
      private.gin_card('3',chr(9830)),private.gin_card('4',chr(9830)),private.gin_card('5',chr(9830)),
      private.gin_card('9',chr(9824)),private.gin_card('9',chr(9829)),private.gin_card('9',chr(9830)),
      private.gin_card('2',chr(9827)),private.gin_card('3',chr(9827)),
      private.gin_card('A',chr(9824)),private.gin_card('K',chr(9829))
    );
    v_dealer_hand := jsonb_build_array(
      private.gin_card('2',chr(9830)),private.gin_card('A',chr(9827)),private.gin_card('9',chr(9827)),
      private.gin_card('7',chr(9829)),private.gin_card('8',chr(9829)),private.gin_card('J',chr(9824)),
      private.gin_card('Q',chr(9830)),private.gin_card('6',chr(9827)),private.gin_card('10',chr(9829)),
      private.gin_card('K',chr(9830))
    );
    v_up_card := private.gin_card('4',chr(9827));
    v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
    v_stock := private.gin_deck_without(v_used);
  ELSIF v_harness='near_gin' THEN
    SELECT participant.id INTO v_target_id
      FROM public.players participant
     WHERE participant.game_id=_game.id
       AND participant.user_id=_game.current_host
       AND participant.id IN (_dealer_id,_nondealer_id)
     LIMIT 1;
    IF v_target_id IS NOT NULL THEN
      v_target_hand := jsonb_build_array(
        private.gin_card('A',chr(9824)),private.gin_card('2',chr(9824)),private.gin_card('3',chr(9824)),
        private.gin_card('4',chr(9829)),private.gin_card('5',chr(9829)),private.gin_card('6',chr(9829)),
        private.gin_card('7',chr(9830)),private.gin_card('8',chr(9830)),private.gin_card('9',chr(9830)),
        private.gin_card('K',chr(9827))
      );
      v_other_hand := jsonb_build_array(
        private.gin_card('K',chr(9829)),private.gin_card('K',chr(9830)),private.gin_card('K',chr(9824)),
        private.gin_card('A',chr(9827)),private.gin_card('A',chr(9830)),private.gin_card('2',chr(9827)),
        private.gin_card('2',chr(9829)),private.gin_card('3',chr(9830)),private.gin_card('3',chr(9829)),
        private.gin_card('4',chr(9827))
      );
      v_dealer_hand := CASE WHEN v_target_id=_dealer_id THEN v_target_hand ELSE v_other_hand END;
      v_nondealer_hand := CASE WHEN v_target_id=_nondealer_id THEN v_target_hand ELSE v_other_hand END;
      v_up_card := private.gin_card('10',chr(9830));
      v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
      v_stock := private.gin_deck_without(v_used);
    END IF;
  END IF;

  IF v_dealer_hand IS NULL THEN
    SELECT jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality BETWEEN 1 AND 10),
           jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality BETWEEN 11 AND 20),
           (jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality=21))->0,
           jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality>21)
      INTO v_nondealer_hand,v_dealer_hand,v_up_card,v_stock
      FROM jsonb_array_elements(v_deck) WITH ORDINALITY card(value,ordinality);
  END IF;

  RETURN jsonb_build_object(
    'phase','first_draw',
    'dealerPlayerId',_dealer_id,
    'nonDealerPlayerId',_nondealer_id,
    'playerStates',jsonb_build_object(
      _dealer_id::text,jsonb_build_object('playerId',_dealer_id,'hand',v_dealer_hand,'melds','[]'::jsonb,'deadwood','[]'::jsonb,'deadwoodValue',0,'hasKnocked',false,'hasGin',false,'laidOffCards','[]'::jsonb),
      _nondealer_id::text,jsonb_build_object('playerId',_nondealer_id,'hand',v_nondealer_hand,'melds','[]'::jsonb,'deadwood','[]'::jsonb,'deadwoodValue',0,'hasKnocked',false,'hasGin',false,'laidOffCards','[]'::jsonb)
    ),
    'turnOrder',jsonb_build_array(_nondealer_id,_dealer_id),
    'stockPile',coalesce(v_stock,'[]'::jsonb),
    'discardPile',jsonb_build_array(v_up_card),
    'currentTurnPlayerId',_nondealer_id,
    'turnPhase','draw',
    'drawSource',NULL,
    'firstDrawOfferedTo',_nondealer_id,
    'firstDrawPassed','[]'::jsonb,
    'anteAmount',_ante_amount,
    'pot',0,
    'pointsToWin',_points_to_win,
    'matchScores',coalesce(_match_scores,jsonb_build_object(_dealer_id::text,0,_nondealer_id::text,0)),
    'knockResult',NULL,
    'actionCount',0,
    'handNumber',_hand_number,
    'lastAction',NULL,
    'winnerPlayerId',NULL,
    'botActionDueAt',to_char((clock_timestamp()+interval '1 second') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

REVOKE ALL ON FUNCTION private.gin_deck_without(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_deal_state(public.games,uuid,uuid,jsonb,integer,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.start_gin_rummy_initial_hand(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_player_ids uuid[];
  v_dealer_id uuid;
  v_nondealer_id uuid;
  v_dealer_config jsonb;
  v_points integer;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:authentication_required'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:not_gin_game'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'start_gin_rummy_initial_hand:not_in_session';
  END IF;
  IF v_game.current_game_uuid IS NULL THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:missing_dealer_game'; END IF;

  SELECT * INTO v_round FROM public.rounds
   WHERE game_id=_game_id AND dealer_game_id=v_game.current_game_uuid AND hand_number=1 AND round_number=1
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
  END IF;

  IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','wrong_status','status',v_game.status);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.players p WHERE p.game_id=_game_id
      AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left')
      AND p.ante_decision IS NULL
  ) THEN
    RETURN jsonb_build_object('outcome','rejected','reason','waiting_for_antes','status',v_game.status);
  END IF;
  SELECT array_agg(p.id ORDER BY p.position) INTO v_player_ids
    FROM public.players p WHERE p.game_id=_game_id AND p.ante_decision='ante_up'
      AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left');
  IF coalesce(cardinality(v_player_ids),0)<>2 THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:requires_two_admitted_players'; END IF;

  SELECT config INTO v_dealer_config FROM public.dealer_games
   WHERE id=v_game.current_game_uuid AND session_id=_game_id AND game_type='gin-rummy' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:dealer_game_not_found'; END IF;
  IF coalesce(v_dealer_config->>'points_to_win','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:invalid_config'; END IF;
  v_points := (v_dealer_config->>'points_to_win')::integer;

  SELECT p.id INTO v_dealer_id FROM public.players p
   WHERE p.game_id=_game_id AND p.id=ANY(v_player_ids) AND p.position=v_game.dealer_position LIMIT 1;
  v_dealer_id := coalesce(v_dealer_id,v_player_ids[1]);
  SELECT player_id INTO v_nondealer_id FROM unnest(v_player_ids) player_id WHERE player_id<>v_dealer_id LIMIT 1;
  v_state := private.gin_deal_state(v_game,v_dealer_id,v_nondealer_id,NULL,1,v_points,v_game.ante_amount);

  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  BEGIN
    INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,gin_rummy_state)
    VALUES (_game_id,v_game.current_game_uuid,1,1,10,0,'betting',private.gin_public_state(v_state))
    RETURNING * INTO v_round;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_round FROM public.rounds
     WHERE game_id=_game_id AND dealer_game_id=v_game.current_game_uuid AND hand_number=1 AND round_number=1 LIMIT 1;
    SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
  END;
  PERFORM private.gin_publish_state(v_round.id,v_state);
  UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,is_first_hand=true WHERE id=_game_id;
  RETURN jsonb_build_object('outcome','started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
END;
$$;

REVOKE ALL ON FUNCTION public.start_gin_rummy_initial_hand(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_gin_rummy_initial_hand(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.gin_score_state(_state jsonb, _dealer_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_config jsonb;
  v_knocker text;
  v_opponent text;
  v_knocker_group jsonb;
  v_opponent_group jsonb;
  v_knocker_deadwood integer;
  v_opponent_deadwood integer;
  v_is_gin boolean;
  v_is_undercut boolean;
  v_points integer;
  v_winner text;
  v_scores jsonb := coalesce(_state->'matchScores','{}'::jsonb);
  v_winner_score integer;
  v_target integer;
BEGIN
  SELECT config INTO v_config FROM public.dealer_games WHERE id=_dealer_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_score_state:dealer_game_not_found'; END IF;
  SELECT key INTO v_knocker FROM jsonb_each(_state->'playerStates')
   WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
  IF v_knocker IS NULL THEN RAISE EXCEPTION 'gin_score_state:no_knocker'; END IF;
  SELECT key INTO v_opponent FROM jsonb_each(_state->'playerStates') WHERE key<>v_knocker LIMIT 1;
  v_knocker_group := private.gin_optimal_grouping(_state->'playerStates'->v_knocker->'hand');
  v_opponent_group := private.gin_optimal_grouping(_state->'playerStates'->v_opponent->'hand');
  v_knocker_deadwood := (v_knocker_group->>'deadwoodValue')::integer;
  v_opponent_deadwood := (v_opponent_group->>'deadwoodValue')::integer;
  v_is_gin := coalesce((_state->'playerStates'->v_knocker->>'hasGin')::boolean,false);
  IF v_is_gin AND v_knocker_deadwood<>0 THEN RAISE EXCEPTION 'gin_score_state:invalid_gin'; END IF;
  v_is_undercut := NOT v_is_gin AND v_opponent_deadwood<=v_knocker_deadwood;
  IF v_is_gin THEN
    v_points := v_opponent_deadwood + coalesce((v_config->>'gin_bonus')::integer,25); v_winner:=v_knocker;
  ELSIF v_is_undercut THEN
    v_points := v_knocker_deadwood-v_opponent_deadwood+coalesce((v_config->>'undercut_bonus')::integer,25); v_winner:=v_opponent;
  ELSE
    v_points := v_opponent_deadwood-v_knocker_deadwood; v_winner:=v_knocker;
  END IF;
  v_winner_score := coalesce((v_scores->>v_winner)::integer,0)+v_points;
  v_scores := jsonb_set(v_scores,ARRAY[v_winner],to_jsonb(v_winner_score),true);
  v_target := (_state->>'pointsToWin')::integer;
  _state := jsonb_set(_state,ARRAY['playerStates',v_knocker,'melds'],v_knocker_group->'melds',true);
  _state := jsonb_set(_state,ARRAY['playerStates',v_knocker,'deadwood'],v_knocker_group->'deadwood',true);
  _state := jsonb_set(_state,ARRAY['playerStates',v_knocker,'deadwoodValue'],to_jsonb(v_knocker_deadwood),true);
  _state := jsonb_set(_state,ARRAY['playerStates',v_opponent,'melds'],v_opponent_group->'melds',true);
  _state := jsonb_set(_state,ARRAY['playerStates',v_opponent,'deadwood'],v_opponent_group->'deadwood',true);
  _state := jsonb_set(_state,ARRAY['playerStates',v_opponent,'deadwoodValue'],to_jsonb(v_opponent_deadwood),true);
  _state := jsonb_set(_state,'{phase}','"complete"'::jsonb,true);
  _state := jsonb_set(_state,'{matchScores}',v_scores,true);
  _state := jsonb_set(_state,'{knockResult}',jsonb_build_object(
    'knockerId',v_knocker,'opponentId',v_opponent,'knockerDeadwood',v_knocker_deadwood,
    'opponentDeadwood',v_opponent_deadwood,'isGin',v_is_gin,'isUndercut',v_is_undercut,
    'pointsAwarded',v_points,'winnerId',v_winner
  ),true);
  _state := jsonb_set(_state,'{winnerPlayerId}',CASE WHEN v_winner_score>=v_target THEN to_jsonb(v_winner) ELSE 'null'::jsonb END,true);
  _state := jsonb_set(_state,'{actionCount}',to_jsonb(coalesce((_state->>'actionCount')::bigint,0)+1),true);
  _state := jsonb_set(_state,'{completeDueAt}',to_jsonb(to_char((clock_timestamp()+interval '5 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  RETURN _state;
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_record_hand_result(_round public.rounds, _state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb := _state->'knockResult';
  v_winner uuid;
  v_loser uuid;
  v_username text;
  v_description text;
BEGIN
  IF jsonb_typeof(v_result)<>'object' THEN RETURN; END IF;
  v_winner := (v_result->>'winnerId')::uuid;
  v_loser := CASE WHEN (v_result->>'knockerId')::uuid=v_winner THEN (v_result->>'opponentId')::uuid ELSE (v_result->>'knockerId')::uuid END;
  SELECT coalesce(profile.username,CASE WHEN player.is_bot THEN 'Bot' ELSE 'Player '||player.position END)
    INTO v_username FROM public.players player LEFT JOIN public.profiles profile ON profile.id=player.user_id WHERE player.id=v_winner;
  v_description := CASE WHEN (v_result->>'isGin')::boolean THEN 'Gin!'
    WHEN (v_result->>'isUndercut')::boolean THEN 'Undercut!'
    ELSE 'Knock ('||(v_result->>'knockerDeadwood')||' vs '||(v_result->>'opponentDeadwood')||')' END
    ||' +'||(v_result->>'pointsAwarded')||' pts';
  INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
  VALUES (_round.game_id,_round.dealer_game_id,_round.hand_number,'gin_rummy_hand_history','gin-rummy',v_winner,v_username,v_username||': '||v_description,0,jsonb_build_object(v_winner::text,0,v_loser::text,0),false)
  ON CONFLICT (dealer_game_id,hand_number,settlement_key) WHERE settlement_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private.gin_score_state(jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.gin_record_hand_result(public.rounds,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.gin_apply_action_core(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _card jsonb,
  _meld_index integer,
  _expected_action_count bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_hand jsonb;
  v_actual_card jsonb;
  v_top jsonb;
  v_opponent text;
  v_knocker text;
  v_group jsonb;
  v_opponent_group jsonb;
  v_target_meld jsonb;
  v_melds jsonb;
  v_new_meld jsonb;
  v_count bigint;
  v_phase text;
  v_now text := to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_apply_action:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_apply_action:not_gin_game'; END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','state',NULL);
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:state_not_found'; END IF;
  IF NOT (v_state->'playerStates' ? _player_id::text) THEN RAISE EXCEPTION 'gin_rummy_apply_action:player_not_in_round'; END IF;
  v_count := coalesce((v_state->>'actionCount')::bigint,0);
  IF _expected_action_count IS NOT NULL AND _expected_action_count IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('outcome','stale_action','state',v_state);
  END IF;

  IF _action='take_first_draw' THEN
    IF v_state->>'phase'<>'first_draw' OR v_state->>'firstDrawOfferedTo'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_first_draw_take'; END IF;
    v_top := v_state->'discardPile'->(jsonb_array_length(v_state->'discardPile')-1);
    IF v_top IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:discard_empty'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand' || jsonb_build_array(v_top);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{discardPile}',private.gin_array_pop(v_state->'discardPile'),true);
    v_state := jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(_player_id::text),true);
    v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{drawSource}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{firstDrawOfferedTo}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{firstDrawPassed}','[]'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','draw_discard','playerId',_player_id,'card',v_top,'timestamp',v_now),true);

  ELSIF _action='pass_first_draw' THEN
    IF v_state->>'phase'<>'first_draw' OR v_state->>'firstDrawOfferedTo'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_first_draw_pass'; END IF;
    IF jsonb_array_length(coalesce(v_state->'firstDrawPassed','[]'::jsonb))=0 THEN
      v_state := jsonb_set(v_state,'{firstDrawPassed}',jsonb_build_array(_player_id),true);
      v_state := jsonb_set(v_state,'{firstDrawOfferedTo}',to_jsonb(v_state->>'dealerPlayerId'),true);
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_state->>'dealerPlayerId'),true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','pass_first_draw','playerId',_player_id,'timestamp',v_now),true);
    ELSE
      v_opponent := v_state->>'nonDealerPlayerId';
      v_top := v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
      IF v_top IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:stock_empty'; END IF;
      v_hand := v_state->'playerStates'->v_opponent->'hand' || jsonb_build_array(v_top);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'hand'],v_hand,true);
      v_state := jsonb_set(v_state,'{stockPile}',private.gin_array_pop(v_state->'stockPile'),true);
      v_state := jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
      v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
      v_state := jsonb_set(v_state,'{drawSource}','"stock"'::jsonb,true);
      v_state := jsonb_set(v_state,'{firstDrawOfferedTo}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{firstDrawPassed}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','draw_stock','playerId',v_opponent,'card',v_top,'timestamp',v_now),true);
    END IF;

  ELSIF _action IN ('draw_stock','draw_discard') THEN
    IF v_state->>'phase'<>'playing' OR v_state->>'currentTurnPlayerId'<>_player_id::text OR v_state->>'turnPhase'<>'draw' THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_draw'; END IF;
    IF _action='draw_stock' THEN
      IF jsonb_array_length(v_state->'stockPile')<=2 THEN RAISE EXCEPTION 'gin_rummy_apply_action:stock_exhausted'; END IF;
      v_top := v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
      v_state := jsonb_set(v_state,'{stockPile}',private.gin_array_pop(v_state->'stockPile'),true);
      v_state := jsonb_set(v_state,'{drawSource}','"stock"'::jsonb,true);
    ELSE
      IF jsonb_array_length(v_state->'discardPile')=0 THEN RAISE EXCEPTION 'gin_rummy_apply_action:discard_empty'; END IF;
      v_top := v_state->'discardPile'->(jsonb_array_length(v_state->'discardPile')-1);
      v_state := jsonb_set(v_state,'{discardPile}',private.gin_array_pop(v_state->'discardPile'),true);
      v_state := jsonb_set(v_state,'{drawSource}','"discard"'::jsonb,true);
    END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand' || jsonb_build_array(v_top);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type',_action,'playerId',_player_id,'card',v_top,'timestamp',v_now),true);

  ELSIF _action IN ('discard','knock') THEN
    IF v_state->>'phase'<>'playing' OR v_state->>'currentTurnPlayerId'<>_player_id::text OR v_state->>'turnPhase'<>'discard' THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_discard'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand';
    v_actual_card := private.gin_find_card(v_hand,_card);
    IF v_actual_card IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:card_not_in_hand'; END IF;
    IF v_state->>'drawSource'='discard'
       AND private.gin_card_key(v_state->'lastAction'->'card')=private.gin_card_key(v_actual_card) THEN
      RAISE EXCEPTION 'gin_rummy_apply_action:cannot_rediscard_picked_discard';
    END IF;
    v_hand := private.gin_remove_cards(v_hand,jsonb_build_array(v_actual_card));
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{discardPile}',v_state->'discardPile'||jsonb_build_array(v_actual_card),true);
    v_opponent := CASE WHEN _player_id::text=v_state->>'dealerPlayerId' THEN v_state->>'nonDealerPlayerId' ELSE v_state->>'dealerPlayerId' END;
    IF _action='discard' THEN
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
      v_state := jsonb_set(v_state,'{turnPhase}','"draw"'::jsonb,true);
      v_state := jsonb_set(v_state,'{drawSource}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','discard','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      IF jsonb_array_length(v_state->'stockPile')<=2 THEN
        v_state := jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
        v_state := jsonb_set(v_state,'{knockResult}','null'::jsonb,true);
        v_state := jsonb_set(v_state,'{completeDueAt}',to_jsonb(to_char((clock_timestamp()+interval '2 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
      END IF;
    ELSE
      v_group := private.gin_optimal_grouping(v_hand);
      IF (v_group->>'deadwoodValue')::integer>10 THEN RAISE EXCEPTION 'gin_rummy_apply_action:deadwood_exceeds_knock_limit'; END IF;
      v_opponent_group := private.gin_optimal_grouping(v_state->'playerStates'->v_opponent->'hand');
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwoodValue'],v_group->'deadwoodValue',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasKnocked'],'true'::jsonb,true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasGin'],to_jsonb((v_group->>'deadwoodValue')::integer=0),true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'melds'],v_opponent_group->'melds',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'deadwood'],v_opponent_group->'deadwood',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'deadwoodValue'],v_opponent_group->'deadwoodValue',true);
      IF (v_group->>'deadwoodValue')::integer=0 THEN
        v_state := jsonb_set(v_state,'{phase}','"scoring"'::jsonb,true);
        v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(_player_id::text),true);
        v_state := jsonb_set(v_state,'{scoringDueAt}',to_jsonb(to_char((clock_timestamp()+interval '4 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
        v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','gin','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      ELSE
        v_state := jsonb_set(v_state,'{phase}','"knocking"'::jsonb,true);
        v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
        v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','knock','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      END IF;
    END IF;

  ELSIF _action='lay_off' THEN
    IF v_state->>'phase' NOT IN ('knocking','laying_off') OR v_state->>'currentTurnPlayerId'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_layoff_actor'; END IF;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=_player_id::text OR coalesce((v_state->'playerStates'->v_knocker->>'hasGin')::boolean,false) THEN RAISE EXCEPTION 'gin_rummy_apply_action:layoff_not_allowed'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand';
    v_actual_card := private.gin_find_card(v_hand,_card);
    v_melds := v_state->'playerStates'->v_knocker->'melds';
    v_target_meld := v_melds->_meld_index;
    IF v_actual_card IS NULL OR v_target_meld IS NULL OR NOT private.gin_can_lay_off(v_actual_card,v_target_meld) THEN RAISE EXCEPTION 'gin_rummy_apply_action:invalid_layoff'; END IF;
    v_new_meld := jsonb_set(v_target_meld,'{cards}',v_target_meld->'cards'||jsonb_build_array(v_actual_card),true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',v_knocker,'melds',_meld_index::text],v_new_meld,true);
    v_hand := private.gin_remove_cards(v_hand,jsonb_build_array(v_actual_card));
    v_group := private.gin_optimal_grouping(v_hand);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwoodValue'],v_group->'deadwoodValue',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'laidOffCards'],coalesce(v_state->'playerStates'->_player_id::text->'laidOffCards','[]'::jsonb)||jsonb_build_array(v_actual_card),true);
    v_state := jsonb_set(v_state,'{phase}','"laying_off"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','lay_off','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);

  ELSIF _action='finish_lay_off' THEN
    IF v_state->>'phase' NOT IN ('knocking','laying_off') OR v_state->>'currentTurnPlayerId'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_finish_layoff_actor'; END IF;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_finish_layoff_actor'; END IF;
    v_state := jsonb_set(v_state,'{phase}','"scoring"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','decline_lay_off','playerId',_player_id,'timestamp',v_now),true);

  ELSIF _action='finalize_scoring' THEN
    IF v_state->>'phase'<>'scoring' THEN
      RETURN jsonb_build_object('outcome','already_advanced','state',v_state);
    END IF;
  ELSE
    RAISE EXCEPTION 'gin_rummy_apply_action:unknown_action:%',_action;
  END IF;

  IF _action IN ('finish_lay_off','finalize_scoring') THEN
    v_state := private.gin_score_state(v_state,v_round.dealer_game_id);
  ELSE
    v_state := jsonb_set(v_state,'{actionCount}',to_jsonb(v_count+1),true);
    v_state := jsonb_set(v_state,'{botActionDueAt}',to_jsonb(to_char((clock_timestamp()+interval '1 second') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  END IF;

  PERFORM private.gin_publish_state(_round_id,v_state);
  v_phase := v_state->>'phase';
  IF v_phase='complete' THEN
    IF nullif(v_state->>'winnerPlayerId','') IS NULL THEN
      PERFORM private.gin_record_hand_result(v_round,v_state);
    ELSE
      PERFORM public.gin_rummy_settle_game(v_round.game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number);
    END IF;
  END IF;
  RETURN jsonb_build_object('outcome','applied','state',v_state);
END;
$$;

REVOKE ALL ON FUNCTION private.gin_apply_action_core(uuid,uuid,text,jsonb,integer,bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gin_rummy_apply_action(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _card jsonb DEFAULT NULL,
  _meld_index integer DEFAULT NULL,
  _expected_action_count bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_result jsonb;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'gin_rummy_apply_action:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_apply_action:round_not_found'; END IF;
  IF NOT v_service AND NOT EXISTS(
    SELECT 1 FROM public.players p WHERE p.id=_player_id AND p.game_id=v_round.game_id AND p.user_id=v_actor AND p.status<>'left'
  ) AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_apply_action:not_player_actor';
  END IF;
  v_result := private.gin_apply_action_core(_round_id,_player_id,_action,_card,_meld_index,_expected_action_count);
  IF v_result->'state' IS NOT NULL THEN
    v_result := jsonb_set(v_result,'{state}',private.gin_project_state(v_result->'state',v_round.game_id,v_actor),true);
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gin_rummy_apply_action(uuid,uuid,text,jsonb,integer,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gin_rummy_apply_action(uuid,uuid,text,jsonb,integer,bigint) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.gin_start_next_hand_core(_predecessor_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_previous public.rounds%ROWTYPE;
  v_next public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_next_state jsonb;
  v_hand_number integer;
  v_next_dealer uuid;
  v_next_nondealer uuid;
BEGIN
  SELECT * INTO v_previous FROM public.rounds WHERE id=_predecessor_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_previous.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:not_gin_game'; END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_predecessor_round_id FOR UPDATE;
  IF v_state IS NULL OR v_state->>'phase'<>'complete' OR nullif(v_state->>'winnerPlayerId','') IS NOT NULL THEN
    RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_continuable';
  END IF;
  v_hand_number := v_previous.hand_number+1;
  SELECT * INTO v_next FROM public.rounds
   WHERE dealer_game_id=v_previous.dealer_game_id AND hand_number=v_hand_number AND round_number=1
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT state INTO v_next_state FROM private.gin_rummy_round_states WHERE round_id=v_next.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_previous.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_previous.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status,'state',NULL);
  END IF;
  v_next_dealer := (v_state->>'nonDealerPlayerId')::uuid;
  v_next_nondealer := (v_state->>'dealerPlayerId')::uuid;
  v_next_state := private.gin_deal_state(
    v_game,v_next_dealer,v_next_nondealer,v_state->'matchScores',v_hand_number,
    (v_state->>'pointsToWin')::integer,(v_state->>'anteAmount')::integer
  );
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  BEGIN
    INSERT INTO public.rounds(
      game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,gin_rummy_state,predecessor_round_id
    ) VALUES (
      v_previous.game_id,v_previous.dealer_game_id,1,v_hand_number,10,0,'betting',
      private.gin_public_state(v_next_state),v_previous.id
    ) RETURNING * INTO v_next;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_next FROM public.rounds
     WHERE dealer_game_id=v_previous.dealer_game_id AND hand_number=v_hand_number AND round_number=1 LIMIT 1;
    SELECT state INTO v_next_state FROM private.gin_rummy_round_states WHERE round_id=v_next.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
  END;
  PERFORM private.gin_publish_state(v_next.id,v_next_state);
  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=v_previous.id;
  UPDATE public.games SET current_round=1,total_hands=v_hand_number,is_first_hand=false WHERE id=v_previous.game_id;
  RETURN jsonb_build_object('outcome','started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
END;
$$;

REVOKE ALL ON FUNCTION private.gin_start_next_hand_core(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gin_rummy_start_next_hand(_predecessor_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_result jsonb;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_predecessor_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_found'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_start_next_hand:not_in_session';
  END IF;
  v_result := private.gin_start_next_hand_core(_predecessor_round_id);
  IF v_result->'state' IS NOT NULL THEN
    v_result := jsonb_set(v_result,'{state}',private.gin_project_state(v_result->'state',v_round.game_id,v_actor),true);
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gin_rummy_start_next_hand(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gin_rummy_start_next_hand(uuid) TO authenticated,service_role;

-- Keep the proven atomic financial transaction, but admit it only through the
-- new private gameplay owner and correct its historical hand-history ledger.
ALTER FUNCTION public.gin_rummy_settle_game(uuid,uuid,uuid,integer)
  RENAME TO gin_rummy_settle_game_legacy;
REVOKE ALL ON FUNCTION public.gin_rummy_settle_game_legacy(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gin_rummy_settle_game(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_result jsonb;
  v_winner uuid;
  v_loser uuid;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_internal boolean := coalesce(current_setting('app.gin_rummy_authoritative_write',true),'')='on';
BEGIN
  IF v_actor IS NULL AND NOT v_service AND NOT v_internal THEN RAISE EXCEPTION 'gin_rummy_settle_game:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_identity_mismatch';
  END IF;
  IF NOT v_service AND NOT v_internal AND NOT public.user_is_in_game(p_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=p_round_id FOR UPDATE;
  IF v_state IS NULL OR v_state->>'phase'<>'complete' OR nullif(v_state->>'winnerPlayerId','') IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:private_state_not_terminal';
  END IF;
  v_winner := (v_state->>'winnerPlayerId')::uuid;
  SELECT key::uuid INTO v_loser FROM jsonb_object_keys(v_state->'playerStates') key WHERE key::uuid<>v_winner LIMIT 1;
  IF v_loser IS NULL THEN RAISE EXCEPTION 'gin_rummy_settle_game:invalid_private_roster'; END IF;
  IF v_round.gin_rummy_state IS DISTINCT FROM private.gin_public_state(v_state) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:projection_mismatch';
  END IF;
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  v_result := public.gin_rummy_settle_game_legacy(p_game_id,p_round_id,p_dealer_game_id,p_hand_number);
  UPDATE public.game_results
     SET pot_won=0,
         player_chip_changes=jsonb_build_object(v_winner::text,0,v_loser::text,0)
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id
     AND hand_number=p_hand_number AND settlement_key='gin_rummy_hand_history';
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gin_rummy_settle_game(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gin_rummy_settle_game(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS private.gin_rummy_postgame_advances (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL CHECK (hand_number>0),
  winner_player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  target_status text NOT NULL CHECK (target_status IN ('game_selection','dealer_selection','waiting','session_ended')),
  dealer_position integer,
  config_deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(game_id,dealer_game_id,round_id,hand_number)
);

ALTER TABLE private.gin_rummy_postgame_advances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.gin_rummy_postgame_advances FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gin_rummy_advance_postgame(
  _game_id uuid,
  _round_id uuid,
  _dealer_game_id uuid,
  _hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_claim private.gin_rummy_postgame_advances%ROWTYPE;
  v_winner public.players%ROWTYPE;
  v_winner_id uuid;
  v_settlement_count integer;
  v_active_count integer;
  v_active_humans integer;
  v_allow_bot_dealers boolean := false;
  v_make_it_take_it boolean := false;
  v_positions integer[];
  v_human_count integer;
  v_single_human_position integer;
  v_index integer;
  v_next_dealer integer;
  v_target text;
  v_deadline timestamptz;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF _game_id IS NULL OR _round_id IS NULL OR _dealer_game_id IS NULL OR coalesce(_hand_number,0)<1 THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:missing_identity';
  END IF;
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:round_not_found'; END IF;
  IF v_round.game_id IS DISTINCT FROM _game_id OR v_round.dealer_game_id IS DISTINCT FROM _dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM _hand_number THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:not_gin_game'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:not_in_session'; END IF;

  SELECT * INTO v_claim FROM private.gin_rummy_postgame_advances claim
   WHERE claim.game_id=_game_id AND claim.dealer_game_id=_dealer_game_id
     AND claim.round_id=_round_id AND claim.hand_number=_hand_number;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome','already_advanced','deduped',true,'status',v_claim.target_status,
      'dealer_position',v_claim.dealer_position,'config_deadline',v_claim.config_deadline);
  END IF;
  IF v_game.status IS DISTINCT FROM 'game_over' OR v_game.current_game_uuid IS DISTINCT FROM _dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM _hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,'current_hand_number',v_game.total_hands);
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id;
  BEGIN v_winner_id:=nullif(v_state->>'winnerPlayerId','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:malformed_winner'; END;
  IF v_round.status IS DISTINCT FROM 'completed' OR v_state->>'phase'<>'complete' OR v_winner_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:round_not_terminal';
  END IF;
  SELECT count(*) INTO v_settlement_count FROM public.game_results result
   WHERE result.game_id=_game_id AND result.dealer_game_id=_dealer_game_id
     AND result.hand_number=_hand_number AND result.settlement_key='gin_rummy_terminal'
     AND result.winner_player_id=v_winner_id;
  IF v_settlement_count<>1 THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:settlement_not_committed:%',v_settlement_count; END IF;
  SELECT * INTO v_winner FROM public.players WHERE id=v_winner_id AND game_id=_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:winner_not_in_session'; END IF;

  SELECT count(*) FILTER (WHERE NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left') AND p.position IS NOT NULL),
         count(*) FILTER (WHERE NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left') AND p.position IS NOT NULL AND NOT coalesce(p.is_bot,false))
    INTO v_active_count,v_active_humans FROM public.players p WHERE p.game_id=_game_id;
  IF v_active_humans=0 THEN
    v_target:='session_ended';
  ELSIF v_active_count<2 THEN
    v_target:='waiting';
  END IF;

  IF v_target IS NULL THEN
    SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot_dealers
      FROM public.game_defaults defaults WHERE defaults.game_type='holm' LIMIT 1;
    SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_make_it_take_it
      FROM public.system_settings setting WHERE setting.key='make_it_take_it' LIMIT 1;
    IF coalesce(v_make_it_take_it,false) THEN
      IF NOT coalesce(v_winner.is_bot,false) AND NOT coalesce(v_winner.sitting_out,false)
         AND v_winner.status NOT IN ('observer','left') THEN
        v_next_dealer:=v_winner.position;
      ELSE
        SELECT count(*),min(p.position) INTO v_human_count,v_single_human_position
          FROM public.players p WHERE p.game_id=_game_id AND NOT coalesce(p.sitting_out,false)
            AND p.status NOT IN ('observer','left') AND NOT coalesce(p.is_bot,false);
        IF v_human_count=1 THEN v_next_dealer:=v_single_human_position;
        ELSIF v_human_count>1 THEN v_target:='dealer_selection'; END IF;
      END IF;
    END IF;
    IF v_target IS NULL AND v_next_dealer IS NULL THEN
      SELECT array_agg(p.position ORDER BY p.position) INTO v_positions FROM public.players p
       WHERE p.game_id=_game_id AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left')
         AND (coalesce(v_allow_bot_dealers,false) OR NOT coalesce(p.is_bot,false));
      IF coalesce(cardinality(v_positions),0)=0 THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:no_eligible_dealer'; END IF;
      v_index:=array_position(v_positions,coalesce(v_game.dealer_position,1));
      v_next_dealer:=CASE WHEN v_index IS NULL THEN v_positions[1]
        ELSE v_positions[(v_index%cardinality(v_positions))+1] END;
    END IF;
    IF v_target IS NULL THEN
      v_target:='game_selection';
      v_deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30)));
    END IF;
  END IF;

  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL
   WHERE game_id=_game_id AND dealer_game_id=_dealer_game_id AND status IS DISTINCT FROM 'completed';
  UPDATE public.players SET auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,
    ante_decision=NULL,sit_out_next_hand=false,stand_up_next_hand=false
   WHERE game_id=_game_id AND status NOT IN ('observer','left');
  UPDATE public.games SET
    status=v_target,config_complete=false,config_deadline=v_deadline,last_round_result=NULL,current_round=NULL,
    awaiting_next_round=false,next_round_number=NULL,pot=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
    game_over_at=CASE WHEN v_target='session_ended' THEN game_over_at ELSE NULL END,buck_position=NULL,total_hands=0,
    is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
    dealer_position=CASE WHEN v_target='game_selection' THEN v_next_dealer ELSE dealer_position END,
    session_ended_at=CASE WHEN v_target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END,
    pending_session_end=CASE WHEN v_target='session_ended' THEN false ELSE pending_session_end END
   WHERE id=_game_id;
  INSERT INTO private.gin_rummy_postgame_advances(
    game_id,dealer_game_id,round_id,hand_number,winner_player_id,target_status,dealer_position,config_deadline
  ) VALUES (_game_id,_dealer_game_id,_round_id,_hand_number,v_winner_id,v_target,
    CASE WHEN v_target='game_selection' THEN v_next_dealer END,v_deadline);
  RETURN jsonb_build_object('outcome','advanced','deduped',false,'status',v_target,
    'dealer_position',CASE WHEN v_target='game_selection' THEN v_next_dealer END,'config_deadline',v_deadline);
END;
$$;

REVOKE ALL ON FUNCTION public.gin_rummy_advance_postgame(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gin_rummy_advance_postgame(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.gin_apply_bot_action(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_player uuid;
  v_action_count bigint;
  v_phase text;
  v_card jsonb;
  v_candidate jsonb;
  v_best_card jsonb;
  v_group jsonb;
  v_best_deadwood integer := 1000;
  v_knocker text;
  v_meld_index integer;
  v_meld jsonb;
  v_harness text := 'none';
  v_harness_enabled boolean := false;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_apply_bot_action:state_not_found'; END IF;
  BEGIN v_player := (v_state->>'currentTurnPlayerId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'gin_apply_bot_action:invalid_turn_player'; END;
  IF v_player IS NULL OR NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=v_player AND p.is_bot) THEN
    RETURN jsonb_build_object('outcome','not_bot_turn','state',v_state);
  END IF;
  v_action_count:=coalesce((v_state->>'actionCount')::bigint,0);
  v_phase:=v_state->>'phase';

  IF v_phase='first_draw' THEN
    SELECT coalesce(defaults.debug_harness,'none') INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type='gin-rummy' LIMIT 1;
    SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
    IF v_harness='opponent_instant_knock' THEN v_harness:='non_dealer_near_knock'; END IF;
    IF coalesce(v_harness_enabled,false) AND v_harness='non_dealer_near_knock'
       AND v_state->>'nonDealerPlayerId'=v_player::text THEN
      RETURN private.gin_apply_action_core(_round_id,v_player,'take_first_draw',NULL,NULL,v_action_count);
    END IF;
    RETURN private.gin_apply_action_core(_round_id,v_player,'pass_first_draw',NULL,NULL,v_action_count);
  END IF;

  IF v_phase='playing' AND v_state->>'turnPhase'='draw' THEN
    RETURN private.gin_apply_action_core(_round_id,v_player,'draw_stock',NULL,NULL,v_action_count);
  END IF;

  IF v_phase='playing' AND v_state->>'turnPhase'='discard' THEN
    FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_state->'playerStates'->v_player::text->'hand') LOOP
      IF v_state->>'drawSource'='discard'
         AND private.gin_card_key(v_state->'lastAction'->'card')=private.gin_card_key(v_candidate) THEN
        CONTINUE;
      END IF;
      v_group:=private.gin_optimal_grouping(private.gin_remove_cards(
        v_state->'playerStates'->v_player::text->'hand',jsonb_build_array(v_candidate)
      ));
      IF (v_group->>'deadwoodValue')::integer<v_best_deadwood THEN
        v_best_deadwood:=(v_group->>'deadwoodValue')::integer;
        v_best_card:=v_candidate;
      END IF;
    END LOOP;
    IF v_best_card IS NULL THEN RAISE EXCEPTION 'gin_apply_bot_action:no_legal_discard'; END IF;
    RETURN private.gin_apply_action_core(
      _round_id,v_player,CASE WHEN v_best_deadwood<=7 THEN 'knock' ELSE 'discard' END,
      v_best_card,NULL,v_action_count
    );
  END IF;

  IF v_phase IN ('knocking','laying_off') THEN
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=v_player::text THEN RAISE EXCEPTION 'gin_apply_bot_action:invalid_layoff_owner'; END IF;
    FOR v_card IN SELECT value FROM jsonb_array_elements(v_state->'playerStates'->v_player::text->'hand') LOOP
      v_meld_index:=0;
      FOR v_meld IN SELECT value FROM jsonb_array_elements(v_state->'playerStates'->v_knocker->'melds') LOOP
        IF private.gin_can_lay_off(v_card,v_meld) THEN
          RETURN private.gin_apply_action_core(_round_id,v_player,'lay_off',v_card,v_meld_index,v_action_count);
        END IF;
        v_meld_index:=v_meld_index+1;
      END LOOP;
    END LOOP;
    RETURN private.gin_apply_action_core(_round_id,v_player,'finish_lay_off',NULL,NULL,v_action_count);
  END IF;

  RETURN jsonb_build_object('outcome','no_action','state',v_state);
END;
$$;

REVOKE ALL ON FUNCTION private.gin_apply_bot_action(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.advance_due_gin_rummy_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_due record;
  v_count integer := 0;
  v_player uuid;
BEGIN
  FOR v_due IN
    SELECT authority.round_id,authority.state,authority.updated_at,round_row.game_id,
           round_row.dealer_game_id,round_row.hand_number
      FROM private.gin_rummy_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='gin-rummy' AND game_row.status='in_progress'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
       AND (
         (authority.state->>'phase'='scoring' AND coalesce((authority.state->>'scoringDueAt')::timestamptz,authority.updated_at+interval '4 seconds')<=clock_timestamp())
         OR (authority.state->>'phase'='complete' AND coalesce((authority.state->>'completeDueAt')::timestamptz,authority.updated_at+interval '5 seconds')<=clock_timestamp())
         OR (
           authority.state->>'phase' IN ('first_draw','playing','knocking','laying_off')
           AND coalesce((authority.state->>'botActionDueAt')::timestamptz,authority.updated_at+interval '1 second')<=clock_timestamp()
           AND EXISTS(SELECT 1 FROM public.players p WHERE p.id=nullif(authority.state->>'currentTurnPlayerId','')::uuid AND p.is_bot)
         )
       )
     ORDER BY authority.updated_at,authority.round_id
     LIMIT 50
  LOOP
    IF v_due.state->>'phase'='scoring' THEN
      v_player:=(v_due.state->>'currentTurnPlayerId')::uuid;
      PERFORM private.gin_apply_action_core(v_due.round_id,v_player,'finalize_scoring',NULL,NULL,coalesce((v_due.state->>'actionCount')::bigint,0));
    ELSIF v_due.state->>'phase'='complete' THEN
      IF nullif(v_due.state->>'winnerPlayerId','') IS NULL THEN
        PERFORM private.gin_start_next_hand_core(v_due.round_id);
      ELSE
        PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
        PERFORM public.gin_rummy_settle_game(v_due.game_id,v_due.round_id,v_due.dealer_game_id,v_due.hand_number);
      END IF;
    ELSE
      PERFORM private.gin_apply_bot_action(v_due.round_id);
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.advance_due_gin_rummy_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_gin_rummy_state() TO service_role;

DO $schedule$
DECLARE v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='advance-due-gin-rummy-state-1s' LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'advance-due-gin-rummy-state-1s',
    '1 second',
    $cron$SELECT private.advance_due_gin_rummy_state();$cron$
  );
END;
$schedule$;

COMMENT ON TABLE private.gin_rummy_round_states IS
  'Server-owned Gin Rummy state including hidden hands and stock. Public rounds contain only redacted realtime projections.';
COMMENT ON FUNCTION public.start_gin_rummy_initial_hand(uuid) IS
  'Atomically validates Gin admission/antes, deals exact H1, publishes in_progress, and returns the committed caller projection.';
COMMENT ON FUNCTION public.gin_rummy_apply_action(uuid,uuid,text,jsonb,integer,bigint) IS
  'Locks the exact Gin hand and derives one legal draw, discard, knock, layoff, or score transition.';
COMMENT ON FUNCTION private.advance_due_gin_rummy_state() IS
  'Complete disconnect-safe scheduled owner for Gin bots, scoring, successor creation, and terminal settlement.';

SELECT set_config('app.gin_rummy_authoritative_write','off',true);
