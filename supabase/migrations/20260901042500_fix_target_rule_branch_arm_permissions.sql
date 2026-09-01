-- The public arm RPC runs as the authenticated admin, matching the established
-- Cribbage/Gin fixture pattern. Keep profile parsing in the public function so
-- PostgREST callers do not need USAGE on the private schema.

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
  v_expected_game_type text:=CASE
    WHEN p_profile LIKE 'yahtzee:%' THEN 'yahtzee'
    WHEN p_profile LIKE 'holm:%' THEN 'holm-game'
    WHEN p_profile LIKE '357:%' THEN '3-5-7'
    ELSE NULL
  END;
  v_player_count integer;
  v_ttl_seconds integer:=least(900,greatest(60,coalesce(p_ttl_seconds,600)));
  v_expires_at timestamptz:=clock_timestamp()+make_interval(secs=>least(900,greatest(60,coalesce(p_ttl_seconds,600))));
  v_value jsonb; v_requests jsonb; v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id,'admin') THEN
    RETURN jsonb_build_object('outcome','not_authorized','armed',false);
  END IF;
  IF p_profile IS NULL OR NOT p_profile=ANY(ARRAY[
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
  ]) THEN
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

REVOKE ALL ON FUNCTION public.arm_target_rule_branch_harness(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.arm_target_rule_branch_harness(uuid,text,integer) TO authenticated,service_role;
