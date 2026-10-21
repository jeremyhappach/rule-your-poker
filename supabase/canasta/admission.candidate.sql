-- LOCAL CANDIDATE. Closed configure gate; canonical Ante Up owner retains consent.
CREATE FUNCTION private.canasta_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS 'SELECT ''{"version":"canasta-classic-two/1","participants":2,"handSize":15,"drawCount":2,"requiredCanastas":2,"target":5000,"turnMs":120000}''::jsonb';
CREATE FUNCTION private.canasta_actor_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS 'SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) AND EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled)';
CREATE OR REPLACE FUNCTION public.canasta_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.canasta_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'canasta' THEN RAISE EXCEPTION 'canasta:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'canasta:dealer_required' USING ERRCODE='42501';END IF;
 -- Initial launch scope is fake money only, including direct RPC and Run Back.
 -- Check the locked session, never a client-supplied config flag or UI filter.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'canasta:fake_money_only' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'canasta:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'canasta:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'canasta:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'canasta:admission_closed' USING ERRCODE='42501';END IF;
 PERFORM private.canasta_assert_recovery_health();
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'canasta:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.canasta_actor_allowed(user_id)) THEN RAISE EXCEPTION 'canasta:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'canasta:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) <>2 THEN RAISE EXCEPTION 'canasta:player_count';END IF;
 IF g.real_money AND EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'canasta:real_money_bot';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'canasta:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'canasta',jsonb_build_object('ante_amount',stake_i,'rules',private.canasta_rules(),'roster',people)) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='canasta',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
-- Called by canonical Ante Up progression only after every frozen participant consents.
CREATE FUNCTION private.canasta_begin(p_game uuid,p_dealer uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games;dg public.dealer_games;seats_i jsonb;initial_state jsonb;first_round_i uuid:=gen_random_uuid();at_ms bigint;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 -- Recheck at consent completion in case session mode changed after setup.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'canasta:fake_money_only' USING ERRCODE='42501';END IF;
 PERFORM private.canasta_assert_recovery_health();
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.game_type IS DISTINCT FROM 'canasta' OR g.status<>'ante_decision' OR g.is_paused
  OR dg.config->'rules' IS DISTINCT FROM private.canasta_rules() THEN RAISE EXCEPTION 'canasta:begin_identity';END IF;
 IF EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=p_dealer) THEN RETURN jsonb_build_object('outcome','duplicate');END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',CASE WHEN p.is_bot THEN NULL ELSE p.user_id END,
   'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'seat',p.position) ORDER BY CASE WHEN p.user_id=dg.dealer_user_id THEN 0 ELSE 1 END,p.id) INTO seats_i
 FROM public.players p WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF jsonb_array_length(seats_i) IS DISTINCT FROM 2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(seats_i) s WHERE s->>'kind'='human')
  OR (g.real_money AND EXISTS(SELECT 1 FROM jsonb_array_elements(seats_i) s WHERE s->>'kind'='bot')) THEN RAISE EXCEPTION 'canasta:consent';END IF;
 IF jsonb_array_length(dg.config->'roster') IS DISTINCT FROM 2 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(seats_i) s WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dg.config->'roster') r
   WHERE r->>'id'=s->>'id' AND r->>'seat'=s->>'seat' AND (r->>'isBot')::boolean=(s->>'kind'='bot')
    AND (s->>'kind'='bot' OR r->>'userId'=s->>'userId'))) THEN RAISE EXCEPTION 'canasta:roster_changed';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 initial_state:=jsonb_build_object('version','canasta-classic-two/1','id',p_dealer,'sessionId',p_game,'stake',(dg.config->>'ante_amount')::integer,
   'realMoney',g.real_money,'seats',seats_i,'revision',0,'updatedAt',at_ms,'hand',NULL,'totals',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(seats_i) p),
   'completed','[]'::jsonb,'winner',NULL,'receipts','{}'::jsonb,'automatic','[]'::jsonb,'pause',NULL,'pauseEpisode',0);
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(first_round_i,p_game,p_dealer,1,1,0,'betting',0);
 INSERT INTO private.canasta_matches(dealer_game_id,game_id,first_round_id,state,revision,stake,seats) VALUES(p_dealer,p_game,first_round_i,initial_state,0,(dg.config->>'ante_amount')::integer,seats_i);
 UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,ante_decision_deadline=NULL WHERE id=p_game;
 RETURN jsonb_build_object('outcome','started','dealerGameId',p_dealer);
END $$;
REVOKE ALL ON FUNCTION private.canasta_rules(),private.canasta_actor_allowed(uuid),private.canasta_begin(uuid,uuid),public.canasta_configure(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.canasta_configure(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
