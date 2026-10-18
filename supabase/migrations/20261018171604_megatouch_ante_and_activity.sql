-- Canonical ante owns participant consent; this private adapter only starts an accepted match.
CREATE FUNCTION private.megatouch_begin(p_game uuid,p_dealer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games;dg public.dealer_games;r uuid:=gen_random_uuid();people jsonb;balances jsonb;s jsonb;stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('eleven-up','tri-towers','run21') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type='run21' THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
 IF g.game_type='eleven-up' AND EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 PERFORM set_config('app.cribbage_authoritative_write','on',true);PERFORM set_config('app.gin_rummy_authoritative_write','on',true);PERFORM set_config('app.three_five_seven_authoritative_write','on',true);PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 IF g.game_type='run21' THEN
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds)
  VALUES(p_dealer,p_game,r,people,stake_i,balances,balances,2,g.real_money,(dg.config->>'first_placement_seconds')::integer);
 ELSE
  s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'players',people,'rules',dg.config->'rules','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
  IF g.game_type='eleven-up' THEN
   s:=private.eleven_up_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSE
   s:=private.tri_towers_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  END IF;
 END IF;
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $$;
REVOKE ALL ON FUNCTION private.megatouch_begin(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Once offered, the exact dealer-game configuration identifies the accepted stake.
CREATE FUNCTION private.megatouch_frozen_stake() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.game_type IN('eleven-up','tri-towers','run21') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $$;
CREATE TRIGGER megatouch_frozen_stake BEFORE UPDATE OF config ON public.dealer_games FOR EACH ROW EXECUTE FUNCTION private.megatouch_frozen_stake();
REVOKE ALL ON FUNCTION private.megatouch_frozen_stake() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_app_activity() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'activity:authentication_required' USING ERRCODE='42501';END IF;
 UPDATE public.profiles SET last_seen_at=clock_timestamp() WHERE id=auth.uid() AND (last_seen_at IS NULL OR last_seen_at<clock_timestamp()-interval '60 seconds');
END $$;
REVOKE ALL ON FUNCTION public.record_app_activity() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_app_activity() TO authenticated;
-- Existing table-level profile grants override column revokes. Guard this field
-- while preserving established profile/preferences writes and trusted server RPCs.
CREATE FUNCTION private.guard_app_activity_timestamp() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN('authenticated','anon') AND NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN RAISE EXCEPTION 'activity:server_timestamp_required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_app_activity_timestamp BEFORE UPDATE OF last_seen_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_app_activity_timestamp();
REVOKE ALL ON FUNCTION private.guard_app_activity_timestamp() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.admin_recent_activity() RETURNS TABLE(id uuid,name text,last_seen_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'activity:admin_required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT p.id,coalesce(p.username,'Player'),p.last_seen_at FROM public.profiles p ORDER BY p.last_seen_at DESC NULLS LAST,p.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_recent_activity() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_recent_activity() TO authenticated;

CREATE OR REPLACE FUNCTION public.eleven_up_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.eleven_up_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'eleven-up' THEN RAISE EXCEPTION 'eleven_up:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'eleven_up:dealer_required' USING ERRCODE='42501';END IF;
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'eleven_up:real_money_closed' USING ERRCODE='42501';END IF;
 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'eleven_up:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'eleven_up:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'eleven_up:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'eleven_up:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'eleven_up:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.eleven_up_actor_allowed(user_id)) THEN RAISE EXCEPTION 'eleven_up:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'eleven_up:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'eleven_up:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'eleven_up:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'eleven-up',jsonb_build_object('ante_amount',stake_i,'rules',private.eleven_up_admission_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='eleven-up',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.tri_towers_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'tri-towers' THEN RAISE EXCEPTION 'tri_towers:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'tri_towers:dealer_required' USING ERRCODE='42501';END IF;
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'tri_towers:real_money_closed' USING ERRCODE='42501';END IF;
 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'tri_towers:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'tri_towers:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'tri_towers:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.tri_towers_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'tri_towers:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'tri_towers:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.tri_towers_actor_allowed(user_id)) THEN RAISE EXCEPTION 'tri_towers:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'tri_towers:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'tri_towers:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'tri_towers:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'tri-towers',jsonb_build_object('ante_amount',stake_i,'rules',private.tri_towers_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='tri-towers',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  g public.games;
  d public.players;
  dg public.dealer_games;
  r uuid:=gen_random_uuid();
  actor uuid:=auth.uid();
  claim private.dealer_game_setup_commits;
  request_hash text;
  stake integer; first_seconds integer;
  people jsonb;
  balances jsonb;
  result jsonb;
  setup_players jsonb;
BEGIN
  PERFORM private.run21_require_production();
  IF actor IS NULL OR NOT private.run21_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'run21' THEN
    RAISE EXCEPTION 'run21:authenticated_player_required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT EXISTS(
    SELECT 1 FROM public.players
    WHERE game_id=g.id AND user_id=actor AND NOT is_bot AND status='active' AND NOT sitting_out
  ) THEN
    RAISE EXCEPTION 'run21:participant_required' USING ERRCODE='42501';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,5}$' OR p_expected_config_deadline IS NULL THEN
    RAISE EXCEPTION 'run21:invalid_setup';
  END IF;
  stake:=(p_config->>'ante_amount')::integer;
  request_hash:=md5(jsonb_build_array(
    p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline
  )::text);

  SELECT * INTO claim
  FROM private.dealer_game_setup_commits
  WHERE game_id=g.id
    AND expected_config_deadline=p_expected_config_deadline
    AND expected_dealer_position=p_expected_dealer_position;
  IF FOUND THEN
    IF claim.request_hash<>request_hash THEN
      RAISE EXCEPTION 'run21:setup_replay_conflict';
    END IF;
    RETURN claim.result||jsonb_build_object('outcome','already_configured','deduped',true);
  END IF;

  SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
  IF g.status NOT IN ('game_selection','configuring')
    OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
    OR clock_timestamp()>g.config_deadline
    OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position
    OR d.position IS DISTINCT FROM p_expected_dealer_position
    OR d.sitting_out
    OR d.status<>'active'
    OR (d.user_id<>actor AND NOT(d.is_bot AND g.current_host=actor))
    OR coalesce(g.is_paused,false)
    OR coalesce(g.pending_session_end,false) THEN
    RAISE EXCEPTION 'run21:setup_identity';
  END IF;

  IF g.real_money THEN PERFORM private.run21_assert_recovery_health(g.id); END IF;
  IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'run21:outstanding_pot'; END IF;
  PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
  IF g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND is_bot) THEN
    RAISE EXCEPTION 'run21:real_money_humans_required';
  END IF;
  SELECT coalesce(decision_timer_seconds,30) INTO first_seconds FROM public.game_defaults WHERE game_type='run21';
  IF first_seconds IS NULL OR first_seconds NOT BETWEEN 5 AND 60 THEN RAISE EXCEPTION 'run21:invalid_first_placement_timer'; END IF;
  IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out)<>2
    OR EXISTS(
      SELECT 1 FROM public.players
      WHERE game_id=g.id AND status<>'left' AND NOT is_bot
        AND NOT private.run21_actor_allowed(user_id)
    ) THEN
    RAISE EXCEPTION 'run21:two_eligible_players_required';
  END IF;

  -- Historical Run21 dealer-games remain in the session, but only a match
  -- that has not completed its authoritative close, lacks its settlement
  -- receipt, or is still the canonical live pointer may block continuation.
  IF EXISTS(
    SELECT 1
    FROM public.dealer_games prior
    JOIN private.run21_matches m ON m.dealer_game_id=prior.id
    WHERE prior.session_id=g.id
      AND prior.game_type='run21'
      AND (
        m.finished IS DISTINCT FROM true
        OR NOT EXISTS(
          SELECT 1 FROM private.run21_settlements settlement
          WHERE settlement.dealer_game_id=prior.id
        )
        OR g.current_game_uuid=prior.id
      )
  ) THEN
    RAISE EXCEPTION 'run21:live_game_exists';
  END IF;

  SELECT
    jsonb_agg(jsonb_build_object(
      'id',p.id,
      'userId',p.user_id,
      'seat',p.position,
      'name',CASE WHEN p.is_bot THEN 'Run21 bot' ELSE coalesce(pr.username,'Player') END,
      'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,
      'chips',p.chips
    ) ORDER BY p.position),
    jsonb_object_agg(p.id,p.chips)
  INTO people,balances
  FROM public.players p
  JOIN public.profiles pr ON pr.id=p.user_id
  WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out;

  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
    VALUES(g.id,d.user_id,'run21',jsonb_build_object('ante_amount',stake,'run21_authority',2,'first_placement_seconds',first_seconds))
    RETURNING * INTO dg;

  -- Normal setup authority transitions may retire a prior family's presentation.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.players
  SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false
  WHERE game_id=g.id AND status='active' AND NOT sitting_out;

  UPDATE public.games
  SET game_type='run21',
      current_game_uuid=dg.id,
      config_complete=true,
      config_deadline=NULL,
      ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),
      status='ante_decision',
      ante_amount=stake,
      current_round=NULL,
      total_hands=0,
      replay_contract_version=NULL,
      all_decisions_in=false,
      all_decisions_in_round_id=NULL
  WHERE id=g.id
  RETURNING * INTO g;

  SELECT jsonb_agg(to_jsonb(p) ORDER BY position)
  INTO setup_players
  FROM public.players p
  WHERE game_id=g.id;
  result:=jsonb_build_object(
    'outcome','configured',
    'deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',g.id,
      'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(g),
    'dealer_game',to_jsonb(dg),
    'players',setup_players
  );
  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result
  ) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,request_hash,dg.id,result);
  RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(v_game.id,v_game.current_game_uuid,NULL,'start'); END IF;
  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('eleven-up','tri-towers','run21') THEN
      SELECT private.megatouch_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN
      SELECT private.farkle_begin_v1(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$
;
