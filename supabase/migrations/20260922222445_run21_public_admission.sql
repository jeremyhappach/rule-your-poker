-- Run21-only public eligibility. Canonical membership, setup and authority remain intact.
BEGIN;
CREATE OR REPLACE FUNCTION private.run21_actor_allowed(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
 SELECT p_user_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active)
 AND EXISTS(SELECT 1 FROM private.run21_app_test_release WHERE singleton AND enabled AND qualified)
$function$;

CREATE OR REPLACE FUNCTION public.run21_configure_local(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid();
  actor uuid:=auth.uid(); claim private.dealer_game_setup_commits; request_hash text;
  stake integer; people jsonb; balances jsonb; result jsonb; setup_players jsonb;
BEGIN
  PERFORM private.run21_require_local();
  IF actor IS NULL OR NOT private.run21_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'run21' THEN
    RAISE EXCEPTION 'run21:authenticated_player_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=actor AND NOT is_bot AND status='active' AND NOT sitting_out) THEN
    RAISE EXCEPTION 'run21:fake_money_participant_required' USING ERRCODE='42501'; END IF;
  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,5}$' OR p_expected_config_deadline IS NULL THEN
    RAISE EXCEPTION 'run21:invalid_setup'; END IF;
  stake:=(p_config->>'ante_amount')::integer;
  request_hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
  SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
  IF FOUND THEN
    IF claim.request_hash<>request_hash THEN RAISE EXCEPTION 'run21:setup_replay_conflict'; END IF;
    RETURN claim.result||jsonb_build_object('outcome','already_configured','deduped',true);
  END IF;
  SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
  IF g.status NOT IN ('game_selection','configuring') OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
    OR clock_timestamp()>g.config_deadline OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position
    OR d.position IS DISTINCT FROM p_expected_dealer_position OR d.sitting_out OR d.status<>'active'
    OR (d.user_id<>actor AND NOT(d.is_bot AND g.current_host=actor)) OR coalesce(g.is_paused,false) OR coalesce(g.pending_session_end,false) THEN
    RAISE EXCEPTION 'run21:setup_identity'; END IF;
  PERFORM 1 FROM public.players WHERE game_id=g.id FOR UPDATE;
  IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out)<>2
    OR (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND is_bot)<>1
    OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.run21_actor_allowed(user_id)) THEN
    RAISE EXCEPTION 'run21:one_player_and_one_bot_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=g.id) THEN
    RAISE EXCEPTION 'run21:new_local_session_required'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'seat',p.position,
      'name',CASE WHEN p.is_bot THEN 'Run21 bot' ELSE coalesce(pr.username,'Player') END,
      'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips) ORDER BY p.position),
    jsonb_object_agg(p.id,p.chips) INTO people,balances
    FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
    VALUES(g.id,d.user_id,'run21',jsonb_build_object('ante_amount',stake,'run21_local',true)) RETURNING * INTO dg;
  -- Normal setup authority transitions may retire a prior family's presentation.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.players SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false
    WHERE game_id=g.id AND status='active' AND NOT sitting_out;
  UPDATE public.games SET game_type='run21',current_game_uuid=dg.id,config_complete=true,
    config_deadline=NULL,ante_decision_deadline=NULL,status='in_progress',ante_amount=stake,
    current_round=1,total_hands=1,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL
    WHERE id=g.id RETURNING * INTO g;
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
    VALUES(r,g.id,dg.id,1,1,0,'betting',0);
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances)
    VALUES(dg.id,g.id,r,people,stake,balances,balances);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
  result:=jsonb_build_object('outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),
    'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
  INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result)
    VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,request_hash,dg.id,result);
  RETURN result;
END $function$;
COMMIT;
