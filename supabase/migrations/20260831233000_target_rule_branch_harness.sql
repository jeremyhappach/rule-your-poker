-- Exact-game, fake-money-only deterministic fixtures for the Yahtzee, Holm,
-- and 3-5-7 full-seam campaign. Requests are admin/participant scoped,
-- short-lived, and consumed by one authoritative dealer-game identity.

INSERT INTO public.system_settings (key, value)
VALUES ('target_rule_branch_harness', jsonb_build_object('requests', '{}'::jsonb))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.target_rule_branch_profile_game_type(p_profile text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_profile LIKE 'yahtzee:%' THEN 'yahtzee'
    WHEN p_profile LIKE 'holm:%' THEN 'holm-game'
    WHEN p_profile LIKE '357:%' THEN '3-5-7'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION private.target_rule_branch_profile_valid(p_profile text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT p_profile = ANY(ARRAY[
    'yahtzee:category:ones','yahtzee:category:twos','yahtzee:category:threes',
    'yahtzee:category:fours','yahtzee:category:fives','yahtzee:category:sixes',
    'yahtzee:category:three_of_a_kind','yahtzee:category:four_of_a_kind',
    'yahtzee:category:full_house','yahtzee:category:small_straight',
    'yahtzee:category:large_straight','yahtzee:category:yahtzee',
    'yahtzee:category:chance','yahtzee:scratch:yahtzee',
    'yahtzee:upper:below','yahtzee:upper:threshold',
    'yahtzee:joker:forced','yahtzee:terminal:unique','yahtzee:terminal:tie',
    'holm:solo:win','holm:solo:loss','holm:solo:tie','holm:multi:unique',
    'holm:multi:partial_tie','holm:multi:all_tie_human_win',
    'holm:multi:all_tie_chucky_win','holm:multi:all_tie_chucky_tie',
    '357:multi:unique','357:multi:tie','357:round:progression',
    '357:round:rollover','357:terminal:instant_sweep'
  ])
$$;

CREATE OR REPLACE FUNCTION public.get_target_rule_branch_harness(p_game_id uuid)
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
    RETURN jsonb_build_object('outcome','not_authorized','armed',false);
  END IF;
  IF NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome','not_in_game','armed',false);
  END IF;
  SELECT setting.value->'requests'->p_game_id::text INTO v_request
    FROM public.system_settings setting WHERE setting.key='target_rule_branch_harness';
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('outcome','ok','armed',false,'gameId',p_game_id);
  END IF;
  BEGIN
    v_expires_at := nullif(v_request->>'expiresAt','')::timestamptz;
    v_armed := coalesce((v_request->>'armed')::boolean,false)
      AND nullif(v_request->>'armedBy','')::uuid=v_user_id
      AND nullif(v_request->>'gameId','')::uuid=p_game_id
      AND v_expires_at>clock_timestamp();
  EXCEPTION WHEN invalid_text_representation THEN v_armed:=false;
  END;
  RETURN jsonb_build_object(
    'outcome','ok','armed',v_armed,'gameId',p_game_id,
    'profile',v_request->>'profile',
    'expiresAt',CASE WHEN v_armed THEN v_expires_at ELSE NULL END,
    'consumedAt',v_request->>'consumedAt',
    'consumedDealerGameId',v_request->>'consumedDealerGameId',
    'consumedHandNumber',v_request->>'consumedHandNumber',
    'consumedRoundNumber',v_request->>'consumedRoundNumber',
    'cancelledAt',v_request->>'cancelledAt'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.arm_target_rule_branch_harness(
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
  v_user_id uuid:=auth.uid();
  v_game public.games%ROWTYPE;
  v_expected_game_type text:=private.target_rule_branch_profile_game_type(p_profile);
  v_player_count integer;
  v_ttl_seconds integer:=least(900,greatest(60,coalesce(p_ttl_seconds,600)));
  v_expires_at timestamptz:=clock_timestamp()+make_interval(secs=>least(900,greatest(60,coalesce(p_ttl_seconds,600))));
  v_value jsonb; v_requests jsonb; v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id,'admin') THEN
    RETURN jsonb_build_object('outcome','not_authorized','armed',false);
  END IF;
  IF NOT private.target_rule_branch_profile_valid(p_profile) THEN
    RETURN jsonb_build_object('outcome','invalid_profile','armed',false);
  END IF;
  SELECT * INTO v_game FROM public.games game WHERE game.id=p_game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game','armed',false); END IF;
  IF coalesce(v_game.real_money,false) THEN
    RETURN jsonb_build_object('outcome','real_money_forbidden','armed',false);
  END IF;
  IF v_game.game_type IS NOT NULL
     AND NOT (
       (v_expected_game_type='holm-game' AND v_game.game_type IN ('holm','holm-game'))
       OR (v_expected_game_type='3-5-7' AND v_game.game_type IN ('3-5-7','3-5-7-game','357'))
       OR v_game.game_type=v_expected_game_type
     ) THEN
    RETURN jsonb_build_object('outcome','wrong_game_type','armed',false,'gameType',v_game.game_type);
  END IF;
  IF NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome','not_in_game','armed',false);
  END IF;
  IF v_game.status NOT IN ('waiting','dealer_selection','game_selection','configuring','ante_decision') THEN
    RETURN jsonb_build_object('outcome','wrong_status','armed',false,'status',v_game.status);
  END IF;
  IF v_game.current_game_uuid IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.rounds round_row
     WHERE round_row.game_id=p_game_id AND round_row.dealer_game_id=v_game.current_game_uuid
  ) THEN
    RETURN jsonb_build_object('outcome','round_already_started','armed',false);
  END IF;
  SELECT count(*)::integer INTO v_player_count FROM public.players player
   WHERE player.game_id=p_game_id AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left');
  IF v_player_count<2 THEN
    RETURN jsonb_build_object('outcome','requires_active_players','armed',false,'activePlayerCount',v_player_count);
  END IF;
  SELECT setting.value INTO v_value FROM public.system_settings setting
   WHERE setting.key='target_rule_branch_harness' FOR UPDATE;
  v_value:=coalesce(v_value,jsonb_build_object('requests','{}'::jsonb));
  v_requests:=coalesce(v_value->'requests','{}'::jsonb);
  v_request:=jsonb_build_object(
    'armed',true,'profile',p_profile,'expectedGameType',v_expected_game_type,
    'gameId',p_game_id,'armedBy',v_user_id,'armedAt',clock_timestamp(),
    'expiresAt',v_expires_at,'ttlSeconds',v_ttl_seconds,
    'consumedAt',NULL,'consumedDealerGameId',NULL,'consumedHandNumber',NULL,
    'consumedRoundNumber',NULL,'cancelledAt',NULL
  );
  v_requests:=jsonb_set(v_requests,ARRAY[p_game_id::text],v_request,true);
  UPDATE public.system_settings SET
    value=jsonb_set(v_value,'{requests}',v_requests,true),
    updated_at=clock_timestamp(),updated_by=v_user_id
   WHERE key='target_rule_branch_harness';
  RETURN jsonb_build_object(
    'outcome','armed','armed',true,'gameId',p_game_id,'profile',p_profile,
    'expiresAt',v_expires_at,'ttlSeconds',v_ttl_seconds
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_target_rule_branch_harness(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid:=auth.uid(); v_value jsonb; v_requests jsonb; v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id,'admin') THEN
    RETURN jsonb_build_object('outcome','not_authorized','armed',false);
  END IF;
  SELECT setting.value INTO v_value FROM public.system_settings setting
   WHERE setting.key='target_rule_branch_harness' FOR UPDATE;
  v_requests:=coalesce(v_value->'requests','{}'::jsonb);
  v_request:=v_requests->p_game_id::text;
  BEGIN
    IF v_request IS NULL OR nullif(v_request->>'armedBy','')::uuid IS DISTINCT FROM v_user_id THEN
      RETURN jsonb_build_object('outcome','not_armed_by_user','armed',false);
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome','not_armed_by_user','armed',false);
  END;
  -- Evidence is read before teardown. Remove the completed request entirely so
  -- campaign churn cannot turn this one-shot harness into unbounded JSON data.
  v_requests:=v_requests-p_game_id::text;
  UPDATE public.system_settings SET
    value=jsonb_set(v_value,'{requests}',v_requests,true),
    updated_at=clock_timestamp(),updated_by=v_user_id
   WHERE key='target_rule_branch_harness';
  RETURN jsonb_build_object('outcome','cancelled','armed',false,'gameId',p_game_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_target_rule_branch_harness(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.arm_target_rule_branch_harness(uuid,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_target_rule_branch_harness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_target_rule_branch_harness(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arm_target_rule_branch_harness(uuid,text,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_target_rule_branch_harness(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.target_rule_branch_profile_for_context(
  p_game_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer,
  p_round_number integer,
  p_expected_game_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE; v_value jsonb; v_requests jsonb; v_request jsonb;
  v_profile text; v_armed_by uuid; v_request_game_id uuid; v_expires_at timestamptz;
  v_consumed_dealer_game_id uuid; v_consumed_hand_number integer; v_consumed_round_number integer;
BEGIN
  SELECT * INTO v_game FROM public.games game WHERE game.id=p_game_id;
  IF NOT FOUND OR coalesce(v_game.real_money,false) OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RETURN NULL;
  END IF;
  IF NOT (
    (p_expected_game_type='holm-game' AND v_game.game_type IN ('holm','holm-game'))
    OR (p_expected_game_type='3-5-7' AND v_game.game_type IN ('3-5-7','3-5-7-game','357'))
    OR v_game.game_type=p_expected_game_type
  ) THEN RETURN NULL; END IF;
  SELECT setting.value INTO v_value FROM public.system_settings setting
   WHERE setting.key='target_rule_branch_harness' FOR UPDATE;
  v_requests:=coalesce(v_value->'requests','{}'::jsonb);
  v_request:=v_requests->p_game_id::text;
  IF v_request IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_profile:=nullif(v_request->>'profile','');
    v_armed_by:=nullif(v_request->>'armedBy','')::uuid;
    v_request_game_id:=nullif(v_request->>'gameId','')::uuid;
    v_expires_at:=nullif(v_request->>'expiresAt','')::timestamptz;
    v_consumed_dealer_game_id:=nullif(v_request->>'consumedDealerGameId','')::uuid;
    v_consumed_hand_number:=nullif(v_request->>'consumedHandNumber','')::integer;
    v_consumed_round_number:=nullif(v_request->>'consumedRoundNumber','')::integer;
  EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
  END;
  IF v_request_game_id IS DISTINCT FROM p_game_id OR v_expires_at<=clock_timestamp()
     OR NOT private.target_rule_branch_profile_valid(v_profile)
     OR private.target_rule_branch_profile_game_type(v_profile) IS DISTINCT FROM p_expected_game_type
     OR NOT public.has_role(v_armed_by,'admin')
     OR NOT EXISTS(
       SELECT 1 FROM public.players player WHERE player.game_id=p_game_id
        AND player.user_id=v_armed_by AND player.status NOT IN ('observer','left')
     ) THEN RETURN NULL; END IF;
  IF v_request->>'consumedAt' IS NOT NULL THEN
    IF v_consumed_dealer_game_id IS DISTINCT FROM p_dealer_game_id
       OR v_consumed_hand_number IS DISTINCT FROM p_hand_number THEN RETURN NULL; END IF;
    IF p_expected_game_type<>'3-5-7' AND v_consumed_round_number IS DISTINCT FROM p_round_number THEN RETURN NULL; END IF;
    RETURN v_profile;
  END IF;
  IF NOT coalesce((v_request->>'armed')::boolean,false) THEN RETURN NULL; END IF;
  v_request:=v_request||jsonb_build_object(
    'armed',false,'consumedAt',clock_timestamp(),
    'consumedDealerGameId',p_dealer_game_id,'consumedHandNumber',p_hand_number,
    'consumedRoundNumber',p_round_number
  );
  v_requests:=jsonb_set(v_requests,ARRAY[p_game_id::text],v_request,true);
  UPDATE public.system_settings SET
    value=jsonb_set(v_value,'{requests}',v_requests,true),
    updated_at=clock_timestamp(),updated_by=v_armed_by
   WHERE key='target_rule_branch_harness';
  RETURN v_profile;
END;
$function$;

REVOKE ALL ON FUNCTION private.target_rule_branch_profile_game_type(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_rule_branch_profile_valid(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_rule_branch_profile_for_context(uuid,uuid,integer,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.target_rule_branch_profile_for_context(uuid,uuid,integer,integer,text)
  TO service_role;

CREATE OR REPLACE FUNCTION private.target_yahtzee_category(p_profile text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog
AS $$
  SELECT CASE
    WHEN p_profile LIKE 'yahtzee:category:%' THEN split_part(p_profile,':',3)
    WHEN p_profile='yahtzee:scratch:yahtzee' THEN 'yahtzee'
    WHEN p_profile='yahtzee:upper:below' THEN 'chance'
    WHEN p_profile='yahtzee:upper:threshold' THEN 'ones'
    WHEN p_profile='yahtzee:joker:forced' THEN 'sixes'
    WHEN p_profile IN ('yahtzee:terminal:unique','yahtzee:terminal:tie') THEN 'chance'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION private.target_yahtzee_seed_scores(p_profile text,p_is_host boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog
AS $function$
DECLARE
  v_category text:=private.target_yahtzee_category(p_profile);
  v_high jsonb:='{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18,"three_of_a_kind":20,"four_of_a_kind":25,"full_house":25,"small_straight":30,"large_straight":40,"yahtzee":50,"chance":23}'::jsonb;
  v_low jsonb:='{"ones":0,"twos":0,"threes":0,"fours":0,"fives":0,"sixes":0,"three_of_a_kind":0,"four_of_a_kind":0,"full_house":0,"small_straight":0,"large_straight":0,"yahtzee":0,"chance":0}'::jsonb;
BEGIN
  IF p_profile='yahtzee:terminal:tie' THEN RETURN v_high-v_category; END IF;
  IF p_profile='yahtzee:upper:below' THEN
    v_high:=v_high||'{"ones":2}'::jsonb;
    v_low:=v_low||'{"ones":2,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}'::jsonb;
  ELSIF p_profile='yahtzee:upper:threshold' THEN
    v_high:=v_high||'{"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}'::jsonb;
    v_low:=v_low||'{"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}'::jsonb;
  ELSIF p_profile='yahtzee:joker:forced' THEN
    v_high:=v_high-'sixes'-'chance';
    v_low:=(v_low||'{"yahtzee":50}'::jsonb)-'sixes'-'chance';
    RETURN CASE WHEN p_is_host THEN v_high ELSE v_low END;
  END IF;
  RETURN (CASE WHEN p_is_host THEN v_high ELSE v_low END)-v_category;
END;
$function$;

CREATE OR REPLACE FUNCTION private.target_yahtzee_fixture_dice(p_profile text)
RETURNS integer[]
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog
AS $$
  SELECT CASE private.target_yahtzee_category(p_profile)
    WHEN 'ones' THEN ARRAY[1,1,1,4,5]
    WHEN 'twos' THEN ARRAY[2,2,2,4,5]
    WHEN 'threes' THEN ARRAY[3,3,3,4,5]
    WHEN 'fours' THEN ARRAY[4,4,4,2,3]
    WHEN 'fives' THEN ARRAY[5,5,5,2,3]
    WHEN 'sixes' THEN ARRAY[6,6,6,6,6]
    WHEN 'three_of_a_kind' THEN ARRAY[4,4,4,2,3]
    WHEN 'four_of_a_kind' THEN ARRAY[5,5,5,5,2]
    WHEN 'full_house' THEN ARRAY[2,2,3,3,3]
    WHEN 'small_straight' THEN ARRAY[1,2,3,4,6]
    WHEN 'large_straight' THEN ARRAY[2,3,4,5,6]
    WHEN 'yahtzee' THEN CASE WHEN p_profile='yahtzee:scratch:yahtzee'
      THEN ARRAY[1,2,3,4,6] ELSE ARRAY[6,6,6,6,6] END
    ELSE ARRAY[1,2,3,4,5]
  END
$$;

CREATE OR REPLACE FUNCTION public.prepare_yahtzee_rule_branch_turn(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $function$
DECLARE
  v_user_id uuid:=auth.uid(); v_game public.games%ROWTYPE; v_round public.rounds%ROWTYPE;
  v_state jsonb; v_player_id uuid; v_ps jsonb; v_profile text; v_values integer[];
  v_dice jsonb; v_sequence integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id,'admin') OR NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN RETURN jsonb_build_object('outcome','wrong_game_type'); END IF;
  IF coalesce(v_game.real_money,false) THEN RETURN jsonb_build_object('outcome','real_money_forbidden'); END IF;
  SELECT * INTO v_round FROM public.rounds
   WHERE game_id=p_game_id AND dealer_game_id=v_game.current_game_uuid
     AND hand_number=v_game.total_hands AND round_number=v_game.current_round
   FOR UPDATE;
  IF NOT FOUND OR v_round.status IS DISTINCT FROM 'betting' THEN RETURN jsonb_build_object('outcome','round_not_ready'); END IF;
  v_profile:=private.target_rule_branch_profile_for_context(
    p_game_id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number,'yahtzee'
  );
  IF v_profile IS NULL THEN RETURN jsonb_build_object('outcome','fixture_not_consumed'); END IF;
  v_state:=v_round.yahtzee_state;
  v_player_id:=nullif(v_state->>'currentTurnPlayerId','')::uuid;
  v_ps:=v_state->'playerStates'->v_player_id::text;
  IF coalesce((v_ps->>'rollsRemaining')::integer,3)<>3 THEN
    RETURN jsonb_build_object('outcome','already_prepared','playerId',v_player_id);
  END IF;
  v_values:=private.target_yahtzee_fixture_dice(v_profile);
  SELECT jsonb_agg(jsonb_build_object('value',value,'isHeld',false) ORDER BY ordinality)
    INTO v_dice FROM unnest(v_values) WITH ORDINALITY die(value,ordinality);
  v_sequence:=coalesce((v_state->>'actionSequence')::integer,0)+1;
  v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
  v_ps:=jsonb_set(v_ps,'{rollsRemaining}','2'::jsonb,true);
  v_ps:=jsonb_set(v_ps,'{rollKey}',to_jsonb(format('yahtzee-fixture:%s:%s:%s',v_round.id,v_player_id,v_sequence)),true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_id::text],v_ps,true);
  v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds SET yahtzee_state=v_state WHERE id=v_round.id;
  RETURN jsonb_build_object(
    'outcome','prepared','playerId',v_player_id,'category',private.target_yahtzee_category(v_profile),
    'actionSequence',v_sequence,'state',v_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_yahtzee_rule_branch_turn(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_yahtzee_rule_branch_turn(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION private.target_yahtzee_category(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_yahtzee_seed_scores(text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_yahtzee_fixture_dice(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.target_holm_fixture_community(p_profile text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN p_profile LIKE 'holm:%' THEN jsonb_build_array(
    jsonb_build_object('rank','9','suit',chr(9827)),jsonb_build_object('rank','9','suit',chr(9830)),
    jsonb_build_object('rank','9','suit',chr(9829)),jsonb_build_object('rank','9','suit',chr(9824))
  ) ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION private.target_holm_fixture_player_cards(p_profile text,p_player_index integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $function$
DECLARE v_kicker text; v_suit text; v_cards jsonb;
BEGIN
  IF p_profile NOT LIKE 'holm:%' THEN RETURN NULL; END IF;
  v_kicker:=CASE
    WHEN p_profile IN ('holm:solo:win','holm:solo:tie','holm:multi:all_tie_human_win','holm:multi:all_tie_chucky_tie') THEN CASE WHEN p_player_index<=2 THEN 'A' ELSE 'K' END
    WHEN p_profile='holm:solo:loss' THEN CASE WHEN p_player_index=1 THEN 'K' ELSE 'Q' END
    WHEN p_profile='holm:multi:unique' THEN CASE WHEN p_player_index=1 THEN 'A' ELSE 'K' END
    WHEN p_profile='holm:multi:partial_tie' THEN CASE WHEN p_player_index<=2 THEN 'A' ELSE 'K' END
    WHEN p_profile='holm:multi:all_tie_chucky_win' THEN 'K'
    ELSE 'Q' END;
  v_suit:=CASE p_player_index WHEN 1 THEN chr(9827) WHEN 2 THEN chr(9830) WHEN 3 THEN chr(9829) ELSE chr(9824) END;
  v_cards:=jsonb_build_array(
    jsonb_build_object('rank',v_kicker,'suit',v_suit),
    jsonb_build_object('rank','2','suit',v_suit),
    jsonb_build_object('rank','3','suit',v_suit),
    jsonb_build_object('rank','4','suit',v_suit)
  );
  RETURN v_cards;
END;
$function$;

CREATE OR REPLACE FUNCTION private.target_holm_fixture_chucky(p_profile text,p_card_count integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $function$
DECLARE v_kicker text; v_cards jsonb;
BEGIN
  IF p_profile NOT LIKE 'holm:%' THEN RETURN NULL; END IF;
  v_kicker:=CASE
    WHEN p_profile IN ('holm:solo:loss','holm:multi:all_tie_chucky_win','holm:multi:all_tie_chucky_tie') THEN 'A'
    WHEN p_profile IN ('holm:solo:tie') THEN 'A'
    WHEN p_profile IN ('holm:solo:win','holm:multi:all_tie_human_win') THEN 'K'
    ELSE 'Q' END;
  v_cards:=jsonb_build_array(
    jsonb_build_object('rank',v_kicker,'suit',chr(9829)),
    jsonb_build_object('rank','5','suit',chr(9827)),
    jsonb_build_object('rank','6','suit',chr(9830)),
    jsonb_build_object('rank','7','suit',chr(9824)),
    jsonb_build_object('rank','8','suit',chr(9827)),
    jsonb_build_object('rank','10','suit',chr(9830)),
    jsonb_build_object('rank','J','suit',chr(9824))
  );
  SELECT coalesce(jsonb_agg(card ORDER BY ordinality),'[]'::jsonb) INTO v_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY item(card,ordinality)
   WHERE ordinality<=greatest(1,least(7,coalesce(p_card_count,4)));
  RETURN v_cards;
END;
$function$;

CREATE OR REPLACE FUNCTION private.target_357_fixture_slice(
  p_profile text,p_round_number integer,p_player_index integer
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $function$
BEGIN
  IF p_profile='357:terminal:instant_sweep' AND p_round_number=1 THEN
    RETURN CASE p_player_index WHEN 1 THEN jsonb_build_array(
      jsonb_build_object('rank','3','suit',chr(9827)),jsonb_build_object('rank','5','suit',chr(9830)),jsonb_build_object('rank','7','suit',chr(9829)))
      ELSE jsonb_build_array(jsonb_build_object('rank','2','suit',chr(9824)),jsonb_build_object('rank','4','suit',chr(9824)),jsonb_build_object('rank','6','suit',chr(9824))) END;
  END IF;
  IF p_profile='357:multi:unique' AND p_round_number=1 THEN
    RETURN CASE p_player_index WHEN 1 THEN jsonb_build_array(
      jsonb_build_object('rank','A','suit',chr(9827)),jsonb_build_object('rank','A','suit',chr(9830)),jsonb_build_object('rank','2','suit',chr(9827)))
      ELSE jsonb_build_array(jsonb_build_object('rank','K','suit',chr(9829)),jsonb_build_object('rank','Q','suit',chr(9824)),jsonb_build_object('rank','2','suit',chr(9830))) END;
  END IF;
  IF p_profile='357:multi:tie' AND p_round_number=1 THEN
    RETURN CASE p_player_index WHEN 1 THEN jsonb_build_array(
      jsonb_build_object('rank','A','suit',chr(9827)),jsonb_build_object('rank','K','suit',chr(9827)),jsonb_build_object('rank','Q','suit',chr(9827)))
      ELSE jsonb_build_array(jsonb_build_object('rank','A','suit',chr(9830)),jsonb_build_object('rank','K','suit',chr(9830)),jsonb_build_object('rank','Q','suit',chr(9830))) END;
  END IF;
  IF p_profile IN ('357:round:progression','357:round:rollover') THEN
    IF p_round_number=1 THEN RETURN CASE p_player_index WHEN 1 THEN jsonb_build_array(
      jsonb_build_object('rank','A','suit',chr(9827)),jsonb_build_object('rank','K','suit',chr(9827)),jsonb_build_object('rank','Q','suit',chr(9827)))
      ELSE jsonb_build_array(jsonb_build_object('rank','2','suit',chr(9830)),jsonb_build_object('rank','4','suit',chr(9830)),jsonb_build_object('rank','6','suit',chr(9830))) END; END IF;
    IF p_round_number=2 THEN RETURN CASE p_player_index WHEN 1 THEN jsonb_build_array(
      jsonb_build_object('rank','J','suit',chr(9827)),jsonb_build_object('rank','10','suit',chr(9827)))
      ELSE jsonb_build_array(jsonb_build_object('rank','8','suit',chr(9830)),jsonb_build_object('rank','9','suit',chr(9830))) END; END IF;
    IF p_round_number=3 THEN RETURN CASE p_player_index WHEN 1 THEN jsonb_build_array(
      jsonb_build_object('rank','8','suit',chr(9827)),jsonb_build_object('rank','7','suit',chr(9827)))
      ELSE jsonb_build_array(jsonb_build_object('rank','10','suit',chr(9830)),jsonb_build_object('rank','J','suit',chr(9830))) END; END IF;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION private.target_holm_fixture_community(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_holm_fixture_player_cards(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_holm_fixture_chucky(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.target_357_fixture_slice(text,integer,integer) FROM PUBLIC,anon,authenticated;

-- Patch only the bounded state-construction sites. Every replacement is
-- guarded so a source/deployed-definition mismatch aborts the migration.
DO $patch_yahtzee_start$
DECLARE v_definition text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.start_yahtzee_round(uuid,uuid)'::regprocedure) INTO v_definition;
  v_next:=replace(v_definition,'  v_host_player_id uuid;','  v_host_player_id uuid;'||E'\n  v_fixture_profile text;');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:yahtzee_declaration_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'  SELECT coalesce((setting.value->>\'enabled\')::boolean,false)\n    INTO v_harness_enabled',
    E'  IF _predecessor_round_id IS NULL THEN\n    v_fixture_profile:=private.target_rule_branch_profile_for_context(\n      _game_id,v_dealer_game_id,v_hand_number,v_hand_number,\'yahtzee\'\n    );\n  END IF;\n\n  SELECT coalesce((setting.value->>\'enabled\')::boolean,false)\n    INTO v_harness_enabled');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:yahtzee_consume_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'  v_deadline:=private.yahtzee_turn_deadline(_game_id,v_player_ids[1]);',
    E'  IF v_fixture_profile IS NOT NULL THEN\n    SELECT participant.id INTO v_host_player_id FROM public.players participant\n     WHERE participant.game_id=_game_id AND participant.user_id=v_game.current_host\n       AND participant.id=ANY(v_player_ids) LIMIT 1;\n    v_host_player_id:=coalesce(v_host_player_id,v_player_ids[1]);\n    FOREACH v_player_id IN ARRAY v_player_ids LOOP\n      v_seed_scores:=private.target_yahtzee_seed_scores(v_fixture_profile,v_player_id=v_host_player_id);\n      v_player_states:=jsonb_set(\n        v_player_states,ARRAY[v_player_id::text,\'scorecard\',\'scores\'],v_seed_scores,true\n      );\n    END LOOP;\n  END IF;\n\n  v_deadline:=private.yahtzee_turn_deadline(_game_id,v_player_ids[1]);');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:yahtzee_seed_mismatch'; END IF;
  EXECUTE v_next;
END;
$patch_yahtzee_start$;

DO $patch_holm_start$
DECLARE v_definition text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.start_holm_initial_hand(uuid,boolean)'::regprocedure) INTO v_definition;
  v_next:=replace(v_definition,'  v_player_id uuid;',
    '  v_player_id uuid;'||E'\n  v_fixture_profile text;\n  v_player_index integer := 0;\n  v_fixture_cards jsonb;');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:holm_declaration_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,E'  WITH deck AS (',
    E'  v_fixture_profile:=private.target_rule_branch_profile_for_context(\n    _game_id,v_game.current_game_uuid,1,1,\'holm-game\'\n  );\n\n  WITH deck AS (');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:holm_consume_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'  UPDATE public.players\n     SET chips = chips - v_ante_amount,',
    E'  IF v_fixture_profile IS NOT NULL THEN\n    v_community_cards:=private.target_holm_fixture_community(v_fixture_profile);\n  END IF;\n\n  UPDATE public.players\n     SET chips = chips - v_ante_amount,');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:holm_community_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,E'  FOREACH v_player_id IN ARRAY v_player_ids LOOP\n    INSERT INTO public.player_cards (',
    E'  FOREACH v_player_id IN ARRAY v_player_ids LOOP\n    v_player_index:=v_player_index+1;\n    v_fixture_cards:=private.target_holm_fixture_player_cards(v_fixture_profile,v_player_index);\n    INSERT INTO public.player_cards (');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:holm_player_loop_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'      jsonb_build_array(\n        v_deck->v_card_offset,\n        v_deck->(v_card_offset + 1),\n        v_deck->(v_card_offset + 2),\n        v_deck->(v_card_offset + 3)\n      ),',
    E'      coalesce(v_fixture_cards,jsonb_build_array(\n        v_deck->v_card_offset,\n        v_deck->(v_card_offset + 1),\n        v_deck->(v_card_offset + 2),\n        v_deck->(v_card_offset + 3)\n      )),');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:holm_cards_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'  -- H1 has no predecessor hand whose publication could mint this event.',
    E'  IF v_fixture_profile IS NOT NULL THEN\n    UPDATE public.rounds SET chucky_cards=private.target_holm_fixture_chucky(\n      v_fixture_profile,coalesce(v_game.chucky_cards,4)\n    ) WHERE id=v_round_id;\n  END IF;\n\n  -- H1 has no predecessor hand whose publication could mint this event.');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:holm_chucky_mismatch'; END IF;
  EXECUTE v_next;
END;
$patch_holm_start$;

DO $patch_357_round$
DECLARE v_definition text; v_next text;
BEGIN
  SELECT pg_get_functiondef('private.three_five_seven_create_round(uuid,uuid,integer,integer,integer,text,timestamp with time zone)'::regprocedure)
    INTO v_definition;
  v_next:=replace(v_definition,
    E'  v_legs jsonb; v_changes jsonb:=\'{}\'::jsonb; v_transfer jsonb:=\'[]\'::jsonb;',
    E'  v_legs jsonb; v_changes jsonb:=\'{}\'::jsonb; v_transfer jsonb:=\'[]\'::jsonb;\n  v_fixture_profile text; v_player_index integer:=0; v_fixture_slice jsonb;');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:357_declaration_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'  IF p_round_number IN (2,3) THEN',
    E'  v_fixture_profile:=private.target_rule_branch_profile_for_context(\n    p_game_id,p_dealer_game_id,p_hand_number,p_round_number,\'3-5-7\'\n  );\n\n  IF p_round_number IN (2,3) THEN');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:357_consume_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,E'  FOREACH v_player_id IN ARRAY v_player_ids LOOP\n    IF p_round_number=1 THEN',
    E'  FOREACH v_player_id IN ARRAY v_player_ids LOOP\n    v_player_index:=v_player_index+1;\n    IF p_round_number=1 THEN');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:357_player_loop_mismatch'; END IF;
  v_definition:=v_next;
  v_next:=replace(v_definition,
    E'    IF jsonb_array_length(v_slice)<>v_new_count THEN RAISE EXCEPTION \'three_five_seven_create_round:deck_underflow\'; END IF;\n    v_cursor:=v_cursor+v_new_count; v_cards:=v_carry||v_slice;',
    E'    v_fixture_slice:=private.target_357_fixture_slice(v_fixture_profile,p_round_number,v_player_index);\n    IF v_fixture_slice IS NOT NULL THEN v_slice:=v_fixture_slice; END IF;\n    IF jsonb_array_length(v_slice)<>v_new_count THEN RAISE EXCEPTION \'three_five_seven_create_round:deck_underflow\'; END IF;\n    v_cursor:=v_cursor+v_new_count; v_cards:=v_carry||v_slice;');
  IF v_next=v_definition THEN RAISE EXCEPTION 'target_fixture:357_slice_mismatch'; END IF;
  EXECUTE v_next;
END;
$patch_357_round$;

COMMENT ON FUNCTION public.arm_target_rule_branch_harness(uuid,text,integer) IS
  'Admin/participant-only exact-game fake-money fixture for the Yahtzee, Holm, and 3-5-7 full-seam campaign.';
