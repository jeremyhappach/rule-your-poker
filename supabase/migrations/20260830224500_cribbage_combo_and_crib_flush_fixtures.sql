-- Extend the exact-game, fake-money-only Cribbage branch harness with
-- deterministic 15/31/run/Go/counting and crib-flush boundary profiles.

CREATE OR REPLACE FUNCTION public.arm_cribbage_rule_branch_harness(
  p_game_id uuid,
  p_profile text,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_game public.games%ROWTYPE;
  v_player_count integer;
  v_ttl_seconds integer := least(900, greatest(60, coalesce(p_ttl_seconds, 600)));
  v_expires_at timestamptz := clock_timestamp()
    + make_interval(secs => least(900, greatest(60, coalesce(p_ttl_seconds, 600))));
  v_value jsonb;
  v_requests jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;
  IF p_profile IS NULL OR p_profile NOT IN (
    'near_double_skunk', 'max_pegging_fan', 'perpetual_heels',
    'fifteen_run_go_counting', 'crib_flush_qualifying',
    'crib_flush_nonqualifying'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_profile', 'armed', false);
  END IF;

  SELECT * INTO v_game FROM public.games game WHERE game.id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing_game', 'armed', false);
  END IF;
  IF coalesce(v_game.real_money, false) THEN
    RETURN jsonb_build_object('outcome', 'real_money_forbidden', 'armed', false);
  END IF;
  IF NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome', 'not_in_game', 'armed', false);
  END IF;
  IF v_game.status NOT IN (
    'waiting', 'dealer_selection', 'game_selection', 'configuring',
    'ante_decision', 'cribbage_dealer_selection'
  ) OR (
    v_game.status = 'cribbage_dealer_selection'
    AND v_game.dealer_selection_state IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'wrong_status', 'armed', false, 'status', v_game.status
    );
  END IF;

  SELECT count(*)::integer
    INTO v_player_count
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND NOT coalesce(player.sitting_out, false)
     AND player.status NOT IN ('observer', 'left');
  IF v_player_count <> 2 THEN
    RETURN jsonb_build_object(
      'outcome', 'requires_two_active_players', 'armed', false,
      'activePlayerCount', v_player_count
    );
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'cribbage_rule_branch_harness'
   FOR UPDATE;
  v_value := coalesce(v_value, jsonb_build_object('requests', '{}'::jsonb));
  v_requests := coalesce(v_value->'requests', '{}'::jsonb);
  v_request := jsonb_build_object(
    'armed', true,
    'profile', p_profile,
    'gameId', p_game_id,
    'armedBy', v_user_id,
    'armedAt', clock_timestamp(),
    'expiresAt', v_expires_at,
    'ttlSeconds', v_ttl_seconds,
    'consumedAt', NULL,
    'cancelledAt', NULL
  );
  v_requests := jsonb_set(v_requests, ARRAY[p_game_id::text], v_request, true);

  UPDATE public.system_settings
     SET value = jsonb_set(v_value, '{requests}', v_requests, true),
         updated_at = clock_timestamp(),
         updated_by = v_user_id
   WHERE key = 'cribbage_rule_branch_harness';

  RETURN jsonb_build_object(
    'outcome', 'armed',
    'armed', true,
    'gameId', p_game_id,
    'profile', p_profile,
    'expiresAt', v_expires_at,
    'ttlSeconds', v_ttl_seconds
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.consume_cribbage_rule_branch_harness(p_game_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_value jsonb;
  v_requests jsonb;
  v_request jsonb;
  v_profile text;
  v_armed_by uuid;
  v_request_game_id uuid;
  v_expires_at timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games game WHERE game.id = p_game_id;
  IF NOT FOUND
     OR coalesce(v_game.real_money, false)
     OR v_game.game_type IS DISTINCT FROM 'cribbage'
     OR v_game.status IS DISTINCT FROM 'cribbage_dealer_selection'
     OR v_game.current_game_uuid IS NULL
     OR v_game.dealer_selection_state->>'isComplete' IS DISTINCT FROM 'true' THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM public.players player
       WHERE player.game_id = p_game_id
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')) <> 2 THEN
    RETURN NULL;
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'cribbage_rule_branch_harness'
   FOR UPDATE;
  v_requests := coalesce(v_value->'requests', '{}'::jsonb);
  v_request := v_requests->p_game_id::text;
  IF v_request IS NULL THEN RETURN NULL; END IF;

  BEGIN
    v_profile := nullif(v_request->>'profile', '');
    v_armed_by := nullif(v_request->>'armedBy', '')::uuid;
    v_request_game_id := nullif(v_request->>'gameId', '')::uuid;
    v_expires_at := nullif(v_request->>'expiresAt', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  IF NOT coalesce((v_request->>'armed')::boolean, false)
     OR v_profile IS NULL
     OR v_profile NOT IN (
       'near_double_skunk', 'max_pegging_fan', 'perpetual_heels',
       'fifteen_run_go_counting', 'crib_flush_qualifying',
       'crib_flush_nonqualifying'
     )
     OR v_request_game_id IS DISTINCT FROM p_game_id
     OR v_expires_at <= clock_timestamp()
     OR NOT public.has_role(v_armed_by, 'admin')
     OR NOT EXISTS (
       SELECT 1
         FROM public.players player
        WHERE player.game_id = p_game_id
          AND player.user_id = v_armed_by
          AND player.status NOT IN ('observer', 'left')
     ) THEN
    RETURN NULL;
  END IF;

  v_request := v_request || jsonb_build_object(
    'armed', false,
    'consumedAt', clock_timestamp()
  );
  v_requests := jsonb_set(v_requests, ARRAY[p_game_id::text], v_request, true);
  UPDATE public.system_settings
     SET value = jsonb_set(v_value, '{requests}', v_requests, true),
         updated_at = clock_timestamp(),
         updated_by = v_armed_by
   WHERE key = 'cribbage_rule_branch_harness';
  RETURN v_profile;
END;
$function$;

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
  v_campaign_harness text;
  v_harness_target uuid;
  v_score integer;
  v_state jsonb;
  v_non_dealer_deal jsonb;
  v_dealer_deal jsonb;
BEGIN
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type = 'cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean, false) INTO v_harness_enabled
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode' LIMIT 1;
  v_campaign_harness := private.consume_cribbage_rule_branch_harness(p_game.id);
  IF v_campaign_harness IS NOT NULL THEN
    v_harness := v_campaign_harness;
    v_harness_enabled := true;
  END IF;
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

  IF coalesce(v_harness_enabled, false)
     AND v_harness IN ('max_pegging_fan', 'perpetual_heels')
     AND v_player_count = 2
     AND (v_harness = 'max_pegging_fan' OR v_campaign_harness IS NOT NULL) THEN
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
  ELSIF coalesce(v_harness_enabled, false)
     AND v_harness = 'fifteen_run_go_counting'
     AND v_player_count = 2
     AND v_campaign_harness IS NOT NULL THEN
    v_non_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','A','suit','spades','value',1),
      jsonb_build_object('rank','A','suit','hearts','value',1),
      jsonb_build_object('rank','5','suit','spades','value',5),
      jsonb_build_object('rank','6','suit','spades','value',6),
      jsonb_build_object('rank','9','suit','spades','value',9),
      jsonb_build_object('rank','7','suit','spades','value',7)
    );
    v_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','A','suit','diamonds','value',1),
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','10','suit','hearts','value',10),
      jsonb_build_object('rank','10','suit','diamonds','value',10),
      jsonb_build_object('rank','8','suit','spades','value',8),
      jsonb_build_object('rank','J','suit','hearts','value',10)
    );
    p_deck := CASE WHEN p_player_ids[1] = p_dealer_id
      THEN v_dealer_deal || v_non_dealer_deal || p_deck
      ELSE v_non_dealer_deal || v_dealer_deal || p_deck END;
  ELSIF coalesce(v_harness_enabled, false)
     AND v_harness IN ('crib_flush_qualifying', 'crib_flush_nonqualifying')
     AND v_player_count = 2
     AND v_campaign_harness IS NOT NULL THEN
    v_non_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','2','suit','clubs','value',2),
      jsonb_build_object('rank','5','suit','spades','value',5),
      jsonb_build_object('rank','6','suit','hearts','value',6),
      jsonb_build_object('rank','8','suit','diamonds','value',8),
      jsonb_build_object('rank','10','suit','clubs','value',10)
    );
    v_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','3','suit','clubs','value',3),
      jsonb_build_object('rank','4','suit','clubs','value',4),
      jsonb_build_object('rank','7','suit','spades','value',7),
      jsonb_build_object('rank','9','suit','hearts','value',9),
      jsonb_build_object('rank','Q','suit','diamonds','value',10),
      jsonb_build_object('rank','K','suit','spades','value',10)
    );
    p_deck := CASE WHEN p_player_ids[1] = p_dealer_id
      THEN v_dealer_deal || v_non_dealer_deal || p_deck
      ELSE v_non_dealer_deal || v_dealer_deal || p_deck END;
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

  v_state := jsonb_build_object(
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
  IF v_campaign_harness IS NOT NULL THEN
    v_state := jsonb_set(v_state, '{campaignHarnessProfile}', to_jsonb(v_campaign_harness), true);
  END IF;
  RETURN v_state;
END;
$$;

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
  v_campaign_harness text:=nullif(p_state->>'campaignHarnessProfile','');
BEGIN
  FOR v_player_id IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP
    v_used:=v_used||coalesce(v_state->'playerStates'->v_player_id->'hand','[]'::jsonb)||coalesce(v_state->'playerStates'->v_player_id->'discardedToCrib','[]'::jsonb);
  END LOOP;
  SELECT coalesce(jsonb_agg(card), '[]'::jsonb) INTO v_available FROM jsonb_array_elements(private.cribbage_new_deck()) card
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_used) used WHERE used->>'rank'=card->>'rank' AND used->>'suit'=card->>'suit');
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type='cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
  IF v_campaign_harness IS NOT NULL THEN v_harness:=v_campaign_harness; v_harness_enabled:=true; END IF;
  IF coalesce(v_harness_enabled,false) AND v_harness='max_pegging_fan' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='spades' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='perpetual_heels' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='J' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='fifteen_run_go_counting' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='hearts' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='crib_flush_qualifying' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='5' AND card->>'suit'='clubs' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='crib_flush_nonqualifying' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='5' AND card->>'suit'='hearts' LIMIT 1; END IF;
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

REVOKE ALL ON FUNCTION public.arm_cribbage_rule_branch_harness(uuid,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arm_cribbage_rule_branch_harness(uuid,text,integer)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.consume_cribbage_rule_branch_harness(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.consume_cribbage_rule_branch_harness(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION private.cribbage_initial_state(public.games, uuid[], uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cribbage_finish_discard(jsonb)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.arm_cribbage_rule_branch_harness(uuid,text,integer) IS
  'Arms one expiring exact-game fake-money Cribbage rule profile for the first authoritative hand.';
