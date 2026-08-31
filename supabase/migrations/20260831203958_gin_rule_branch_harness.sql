-- Exact-game, fake-money-only, one-shot Gin Rummy rule-branch fixtures.
--
-- The legacy Gin debug profiles are global. These requests are instead scoped
-- to one generated session, may be armed only by an authenticated admin who is
-- already a participant, expire quickly, and are consumed atomically by the
-- first authoritative Gin hand.

INSERT INTO public.system_settings (key, value)
VALUES ('gin_rule_branch_harness', jsonb_build_object('requests', '{}'::jsonb))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_gin_rule_branch_harness(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_request jsonb;
  v_expires_at timestamptz;
  v_armed boolean := false;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;
  IF NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome', 'not_in_game', 'armed', false);
  END IF;

  SELECT setting.value->'requests'->p_game_id::text
    INTO v_request
    FROM public.system_settings setting
   WHERE setting.key = 'gin_rule_branch_harness';

  IF v_request IS NULL THEN
    RETURN jsonb_build_object('outcome', 'ok', 'armed', false, 'gameId', p_game_id);
  END IF;

  BEGIN
    v_expires_at := nullif(v_request->>'expiresAt', '')::timestamptz;
    v_armed := coalesce((v_request->>'armed')::boolean, false)
      AND nullif(v_request->>'armedBy', '')::uuid = v_user_id
      AND nullif(v_request->>'gameId', '')::uuid = p_game_id
      AND v_expires_at > clock_timestamp();
  EXCEPTION WHEN invalid_text_representation THEN
    v_armed := false;
  END;

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'armed', v_armed,
    'gameId', p_game_id,
    'profile', v_request->>'profile',
    'expiresAt', CASE WHEN v_armed THEN v_expires_at ELSE NULL END,
    'consumedAt', v_request->>'consumedAt',
    'cancelledAt', v_request->>'cancelledAt'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.arm_gin_rule_branch_harness(
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
    'normal_knock_layoff', 'gin', 'undercut', 'stock_two_void'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_profile', 'armed', false);
  END IF;

  SELECT * INTO v_game FROM public.games game WHERE game.id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing_game', 'armed', false);
  END IF;
  IF v_game.game_type IS NOT NULL AND v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN
    RETURN jsonb_build_object('outcome', 'wrong_game_type', 'armed', false);
  END IF;
  IF coalesce(v_game.real_money, false) THEN
    RETURN jsonb_build_object('outcome', 'real_money_forbidden', 'armed', false);
  END IF;
  IF NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome', 'not_in_game', 'armed', false);
  END IF;
  IF v_game.status NOT IN (
    'waiting', 'dealer_selection', 'game_selection', 'configuring', 'ante_decision'
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'wrong_status', 'armed', false, 'status', v_game.status
    );
  END IF;
  IF v_game.current_game_uuid IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.rounds round_row
     WHERE round_row.game_id = p_game_id
       AND round_row.dealer_game_id = v_game.current_game_uuid
       AND round_row.hand_number = 1
  ) THEN
    RETURN jsonb_build_object('outcome', 'hand_already_started', 'armed', false);
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
   WHERE setting.key = 'gin_rule_branch_harness'
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
   WHERE key = 'gin_rule_branch_harness';

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

CREATE OR REPLACE FUNCTION public.cancel_gin_rule_branch_harness(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_value jsonb;
  v_requests jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'gin_rule_branch_harness'
   FOR UPDATE;
  v_requests := coalesce(v_value->'requests', '{}'::jsonb);
  v_request := v_requests->p_game_id::text;

  BEGIN
    IF v_request IS NULL
       OR nullif(v_request->>'armedBy', '')::uuid IS DISTINCT FROM v_user_id THEN
      RETURN jsonb_build_object('outcome', 'not_armed_by_user', 'armed', false);
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'not_armed_by_user', 'armed', false);
  END;

  v_request := v_request || jsonb_build_object(
    'armed', false,
    'cancelledAt', clock_timestamp()
  );
  v_requests := jsonb_set(v_requests, ARRAY[p_game_id::text], v_request, true);
  UPDATE public.system_settings
     SET value = jsonb_set(v_value, '{requests}', v_requests, true),
         updated_at = clock_timestamp(),
         updated_by = v_user_id
   WHERE key = 'gin_rule_branch_harness';

  RETURN jsonb_build_object('outcome', 'cancelled', 'armed', false, 'gameId', p_game_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_gin_rule_branch_harness(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arm_gin_rule_branch_harness(uuid,text,integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_gin_rule_branch_harness(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gin_rule_branch_harness(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arm_gin_rule_branch_harness(uuid,text,integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_gin_rule_branch_harness(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.consume_gin_rule_branch_harness(p_game_id uuid)
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
     OR v_game.game_type IS DISTINCT FROM 'gin-rummy'
     OR v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS NULL THEN
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
   WHERE setting.key = 'gin_rule_branch_harness'
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
     OR v_profile NOT IN ('normal_knock_layoff', 'gin', 'undercut', 'stock_two_void')
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
   WHERE key = 'gin_rule_branch_harness';
  RETURN v_profile;
END;
$function$;

REVOKE ALL ON FUNCTION private.consume_gin_rule_branch_harness(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.consume_gin_rule_branch_harness(uuid)
  TO service_role;

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
  v_discard jsonb;
  v_used jsonb;
  v_remaining jsonb;
  v_harness text := 'none';
  v_harness_enabled boolean := false;
  v_campaign_harness text;
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

  v_campaign_harness := private.consume_gin_rule_branch_harness(_game.id);
  IF v_campaign_harness IS NOT NULL THEN
    v_harness := v_campaign_harness;
    v_harness_enabled := true;
  END IF;

  IF v_harness IN ('non_dealer_near_knock', 'normal_knock_layoff') THEN
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
  ELSIF v_harness='undercut' THEN
    v_nondealer_hand := jsonb_build_array(
      private.gin_card('3',chr(9830)),private.gin_card('4',chr(9830)),private.gin_card('5',chr(9830)),
      private.gin_card('9',chr(9824)),private.gin_card('9',chr(9829)),private.gin_card('9',chr(9830)),
      private.gin_card('2',chr(9827)),private.gin_card('3',chr(9827)),
      private.gin_card('A',chr(9824)),private.gin_card('K',chr(9829))
    );
    v_dealer_hand := jsonb_build_array(
      private.gin_card('2',chr(9830)),
      private.gin_card('6',chr(9829)),private.gin_card('7',chr(9829)),private.gin_card('8',chr(9829)),
      private.gin_card('J',chr(9824)),private.gin_card('Q',chr(9824)),private.gin_card('K',chr(9824)),
      private.gin_card('5',chr(9827)),private.gin_card('5',chr(9829)),private.gin_card('5',chr(9824))
    );
    v_up_card := private.gin_card('4',chr(9827));
    v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
    v_stock := private.gin_deck_without(v_used);
  ELSIF v_harness IN ('near_gin', 'gin') THEN
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
      v_other_hand := CASE WHEN v_harness='near_gin' THEN jsonb_build_array(
        private.gin_card('K',chr(9829)),private.gin_card('K',chr(9830)),private.gin_card('K',chr(9824)),
        private.gin_card('A',chr(9827)),private.gin_card('A',chr(9830)),private.gin_card('2',chr(9827)),
        private.gin_card('2',chr(9829)),private.gin_card('3',chr(9830)),private.gin_card('3',chr(9829)),
        private.gin_card('4',chr(9827))
      ) ELSE jsonb_build_array(
        private.gin_card('K',chr(9824)),private.gin_card('Q',chr(9829)),private.gin_card('J',chr(9827)),
        private.gin_card('10',chr(9824)),private.gin_card('8',chr(9827)),private.gin_card('7',chr(9824)),
        private.gin_card('6',chr(9827)),private.gin_card('5',chr(9830)),private.gin_card('3',chr(9829)),
        private.gin_card('2',chr(9827))
      ) END;
      v_dealer_hand := CASE WHEN v_target_id=_dealer_id THEN v_target_hand ELSE v_other_hand END;
      v_nondealer_hand := CASE WHEN v_target_id=_nondealer_id THEN v_target_hand ELSE v_other_hand END;
      v_up_card := private.gin_card('10',chr(9830));
      v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
      v_stock := private.gin_deck_without(v_used);
    END IF;
  ELSIF v_harness='stock_two_void' THEN
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
    v_used := v_nondealer_hand || v_dealer_hand;
    v_remaining := private.gin_deck_without(v_used);
    SELECT
      jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality <= 3),
      jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality > 3)
      INTO v_stock, v_discard
      FROM jsonb_array_elements(v_remaining) WITH ORDINALITY card(value, ordinality);
    v_up_card := v_discard->(jsonb_array_length(v_discard)-1);
  END IF;

  IF v_dealer_hand IS NULL THEN
    SELECT jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality BETWEEN 1 AND 10),
           jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality BETWEEN 11 AND 20),
           (jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality=21))->0,
           jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality>21)
      INTO v_nondealer_hand,v_dealer_hand,v_up_card,v_stock
      FROM jsonb_array_elements(v_deck) WITH ORDINALITY card(value,ordinality);
  END IF;
  v_discard := coalesce(v_discard, jsonb_build_array(v_up_card));

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
    'discardPile',v_discard,
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

REVOKE ALL ON FUNCTION private.gin_deal_state(public.games,uuid,uuid,jsonb,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.arm_gin_rule_branch_harness(uuid,text,integer) IS
  'Admin-only exact-game fake-money Gin rule fixture; expires and is consumed by the first authoritative hand.';
