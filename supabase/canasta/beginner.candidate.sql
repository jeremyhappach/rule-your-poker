-- LOCAL FOLLOW-UP CANDIDATE ONLY. No activation or production execution.
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS canasta_mode text NOT NULL DEFAULT 'beginner' CHECK (canasta_mode IN ('beginner','expert'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS canasta_helpers boolean NOT NULL DEFAULT true;
-- The original row used the generic timer (unused by Canasta). Establish its standard 120s timer once.
UPDATE public.game_defaults SET decision_timer_seconds=120 WHERE game_type='canasta' AND decision_timer_seconds<30;
CREATE OR REPLACE FUNCTION private.canasta_pacing_defaults() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.game_defaults; BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='canasta';
 IF d.canasta_mode NOT IN ('beginner','expert') OR d.decision_timer_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'canasta:pacing_defaults';END IF;
 RETURN jsonb_build_object('mode',d.canasta_mode,'turnMs',CASE WHEN d.canasta_mode='beginner' THEN 180000 ELSE d.decision_timer_seconds*1000 END,'timeoutPolicy','complete-match');
END $$;
REVOKE ALL ON FUNCTION private.canasta_pacing_defaults() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.canasta_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb; pacing jsonb; prior_config jsonb;
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
 IF NOT private.canasta_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'canasta:admission_closed' USING ERRCODE='42501';END IF;
 PERFORM private.canasta_assert_recovery_health();
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'canasta:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.canasta_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'canasta:tester_required' USING ERRCODE='42501';END IF;
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
 IF p_config ? 'runBackDealerGameId' THEN
  SELECT prior.config INTO prior_config FROM public.dealer_games prior JOIN private.canasta_matches m ON m.dealer_game_id=prior.id
   WHERE prior.id=(p_config->>'runBackDealerGameId')::uuid AND prior.session_id=g.id AND prior.game_type='canasta' AND m.finished AND m.settlement IS NOT NULL;
  IF prior_config IS NULL OR (prior_config->>'ante_amount')::integer IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'canasta:run_back_identity';END IF;
  pacing:=coalesce(prior_config->'experience','{"mode":"expert","turnMs":120000,"timeoutPolicy":"complete-match"}'::jsonb);
 ELSE pacing:=private.canasta_pacing_defaults();END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'canasta',jsonb_build_object('ante_amount',stake_i,'rules',private.canasta_rules(),'experience',pacing,'roster',people)) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='canasta',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION private.canasta_begin(p_game uuid,p_dealer uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
   'config',dg.config->'experience','realMoney',g.real_money,'seats',seats_i,'revision',0,'updatedAt',at_ms,'hand',NULL,'totals',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(seats_i) p),
   'completed','[]'::jsonb,'winner',NULL,'receipts','{}'::jsonb,'automatic','[]'::jsonb,'pause',NULL,'pauseEpisode',0);
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(first_round_i,p_game,p_dealer,1,1,0,'betting',0);
 INSERT INTO private.canasta_matches(dealer_game_id,game_id,first_round_id,state,revision,stake,seats) VALUES(p_dealer,p_game,first_round_i,initial_state,0,(dg.config->>'ante_amount')::integer,seats_i);
 UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,ante_decision_deadline=NULL WHERE id=p_game;
 RETURN jsonb_build_object('outcome','started','dealerGameId',p_dealer);
END $$;
CREATE OR REPLACE FUNCTION public.canasta_server_commit(p_match uuid,p_revision bigint,p_state jsonb,p_context jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.canasta_matches;g public.games;at_ms bigint;actor uuid;command jsonb;request uuid;prior private.canasta_receipts;
 winner uuid;loser uuid;result_id uuid;batch_id uuid;changes jsonb;scores jsonb;first_hand uuid;automatic_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match;
 -- Preserve canonical lock order: round, game, private match, participants.
 PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match FOR UPDATE;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled) THEN RAISE EXCEPTION 'canasta:closed';END IF;
 IF p_context->>'kind' NOT IN('command','recover','control') THEN RAISE EXCEPTION 'canasta:context';END IF;
 IF p_context->>'kind'<>'recover' THEN
  actor:=(p_context->>'userId')::uuid;
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id AND p.user_id=actor AND NOT p.is_bot AND p.status<>'left' AND pr.is_active
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text AND s->>'userId'=actor::text)) THEN RAISE EXCEPTION 'canasta:unauthorized' USING ERRCODE='42501';END IF;
 END IF;
 IF p_context->>'kind'='command' THEN
  command:=p_context->'command';request:=(command->>'requestId')::uuid;
  IF request IS NULL OR command->>'matchId' IS DISTINCT FROM p_match::text OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s
    WHERE s->>'id'=command->>'playerId' AND s->>'userId'=actor::text) THEN RAISE EXCEPTION 'canasta:command_identity';END IF;
  SELECT * INTO prior FROM private.canasta_receipts WHERE dealer_game_id=p_match AND request_id=request;
  IF FOUND THEN
   IF prior.actor<>actor OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'canasta:receipt_conflict';END IF;
   RETURN public.canasta_server_load(p_match,actor);
  END IF;
 END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'canasta:conflict';END IF;
 IF m.finished OR m.settlement IS NOT NULL OR g.current_game_uuid IS DISTINCT FROM p_match OR g.game_type IS DISTINCT FROM 'canasta'
  OR g.status<>'in_progress' THEN RAISE EXCEPTION 'canasta:inactive';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_match AND session_id=m.game_id AND (config->>'ante_amount')::integer=m.stake)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=(s->>'id')::uuid AND p.game_id=m.game_id
    AND p.position=(s->>'seat')::integer AND p.is_bot=(s->>'kind'='bot') AND (p.is_bot OR p.user_id=(s->>'userId')::uuid))) THEN RAISE EXCEPTION 'canasta:frozen_identity';END IF;
 IF g.is_paused AND p_context->>'kind'<>'control' THEN RAISE EXCEPTION 'canasta:paused';END IF;
 IF p_context->>'kind'='recover' AND nullif(p_state->'pause','null'::jsonb) IS NULL
  AND (p_state->'automatic') ? (m.state#>>'{hand,active}')
  AND g.real_money THEN RAISE EXCEPTION 'canasta:conflict';END IF;
 IF command IS NOT NULL THEN
  IF command->>'handId' IS DISTINCT FROM m.state#>>'{hand,id}' OR command->>'turn' IS DISTINCT FROM m.state#>>'{hand,turn}'
   OR command->>'generation' IS DISTINCT FROM m.state#>>'{hand,generation}' OR command->>'playerId' IS DISTINCT FROM m.state#>>'{hand,active}'
   OR (command->>'revision')::bigint<>m.revision THEN RAISE EXCEPTION 'canasta:stale_command';END IF;
  -- Fresh time AFTER row locks. Equality expires; a completed receipt returned above wins.
  IF at_ms>=(m.state#>>'{hand,deadline}')::bigint THEN RAISE EXCEPTION 'canasta:deadline';END IF;
 END IF;
 IF p_state->>'id' IS DISTINCT FROM p_match::text OR p_state->>'sessionId' IS DISTINCT FROM m.game_id::text
  OR p_state->>'version' IS DISTINCT FROM 'canasta-classic-two/1' OR p_state->'seats' IS DISTINCT FROM m.seats OR nullif(p_state->'config','null'::jsonb) IS DISTINCT FROM nullif(m.state->'config','null'::jsonb)
  OR (p_state->>'stake')::integer IS DISTINCT FROM m.stake OR (p_state->>'realMoney')::boolean IS DISTINCT FROM g.real_money
  OR (p_state->>'revision')::bigint<=m.revision THEN RAISE EXCEPTION 'canasta:state_identity';END IF;
 -- A newly admitted turn receives its whole budget at database commit; other actions never reset it.
 IF p_state#>>'{hand,id}' IS DISTINCT FROM m.state#>>'{hand,id}' OR p_state#>>'{hand,turn}' IS DISTINCT FROM m.state#>>'{hand,turn}' THEN
  p_state:=jsonb_set(p_state,'{hand,deadline}',to_jsonb(at_ms+coalesce((m.state#>>'{config,turnMs}')::bigint,120000)));
 END IF;
 p_state:=jsonb_set(p_state,'{updatedAt}',to_jsonb(at_ms));
 IF p_state#>>'{hand,id}' IS NOT NULL THEN
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
   VALUES((p_state#>>'{hand,id}')::uuid,m.game_id,p_match,1,(p_state#>>'{hand,number}')::integer,0,'betting',0) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(p_state#>>'{hand,id}')::uuid AND game_id=m.game_id AND dealer_game_id=p_match AND hand_number=1
    AND round_number=(p_state#>>'{hand,number}')::integer) THEN RAISE EXCEPTION 'canasta:round_identity';END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=p_match AND id IN(SELECT (h->>'id')::uuid FROM jsonb_array_elements(p_state->'completed') h);
  UPDATE public.games SET current_round=(p_state#>>'{hand,number}')::integer WHERE id=m.game_id;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE
   (SELECT coalesce(sum((r->'scores'->>(s->>'id'))::bigint),0) FROM jsonb_array_elements(p_state->'completed') r)
    IS DISTINCT FROM (p_state->'totals'->>(s->>'id'))::bigint) THEN RAISE EXCEPTION 'canasta:score_totals';END IF;
 winner:=nullif(p_state->>'winner','')::uuid;
 IF winner IS NOT NULL THEN
  SELECT (s->>'id')::uuid INTO STRICT loser FROM jsonb_array_elements(m.seats) s WHERE s->>'id'<>winner::text;
  IF p_state#>>'{hand,phase}' IS DISTINCT FROM 'complete' OR (p_state->'totals'->>winner::text)::bigint<5000
   OR (p_state->'totals'->>winner::text)::bigint<=(p_state->'totals'->>loser::text)::bigint THEN RAISE EXCEPTION 'canasta:winner';END IF;
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND id IN(winner,loser))<>2
   OR (g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE id IN(winner,loser) AND is_bot)) THEN RAISE EXCEPTION 'canasta:participants';END IF;
  result_id:=gen_random_uuid();changes:=jsonb_build_object(winner::text,m.stake,loser::text,-m.stake);
  INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
   VALUES(result_id,m.game_id,p_match,1,'canasta_terminal','canasta',winner,
    (SELECT coalesce(pr.username,'Player') FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.id=winner),
    'Canasta: '||(p_state->'totals')::text,m.stake,changes,false);
  PERFORM public.settle_gameplay_chip_transfers(m.game_id,jsonb_build_array(jsonb_build_object(
    'from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',m.stake)),'win');
  SET CONSTRAINTS public.gameplay_transfer_pending_finalize IMMEDIATE;
  SELECT id INTO STRICT batch_id FROM public.gameplay_transfer_batches WHERE game_id=m.game_id AND dealer_game_id=p_match
    AND cursor=(SELECT chip_transfer_cursor FROM public.games WHERE id=m.game_id);
  SET CONSTRAINTS public.gameplay_transfer_pending_finalize DEFERRED;
  INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
   SELECT p.game_id,p_match,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
   WHERE p.game_id=m.game_id ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO NOTHING;
  m.settlement:=jsonb_build_object('key','canasta:'||p_match,'resultId',result_id,'transferBatchId',batch_id,'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE id=batch_id),'winner',winner,'loser',loser,'amount',m.stake,'scores',p_state->'totals','startedAt',at_ms,'deadline',at_ms+3000);
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=p_match;
  UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
    session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
    pending_session_end=false,game_over_at=clock_timestamp(),last_round_result='Canasta complete',awaiting_next_round=false WHERE id=m.game_id;
 END IF;
 UPDATE private.canasta_matches SET state=p_state,revision=(p_state->>'revision')::bigint,settlement=m.settlement,
   bot_due_at=CASE WHEN (EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p_state#>>'{hand,active}' AND s->>'kind'='bot')
     OR (p_state->'automatic') ? (p_state#>>'{hand,active}'))
     AND p_state->'pause'='null'::jsonb AND p_state#>>'{hand,phase}'<>'complete' THEN at_ms+750 END WHERE dealer_game_id=p_match;
 -- Project automatic status through canonical player controls; no participant is removed between hands.
 UPDATE public.players p SET auto_fold=EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_state->'automatic') a WHERE a=p.id::text),
   sit_out_next_hand=CASE WHEN p_context->>'kind'='control' AND p.user_id=actor THEN false
     WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_state->'automatic') a WHERE a=p.id::text) THEN true ELSE p.sit_out_next_hand END,
   stand_up_next_hand=CASE WHEN p_context->>'kind'='control' AND p.user_id=actor THEN false ELSE p.stand_up_next_hand END,
   auto_play_stop_round_id=CASE WHEN p_context->>'kind'='control' AND p.user_id=actor THEN NULL ELSE p.auto_play_stop_round_id END
  WHERE p.game_id=m.game_id AND NOT p.is_bot AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text);
 IF nullif(p_state->'pause','null'::jsonb) IS NOT NULL AND NOT g.is_paused THEN
  IF g.real_money AND p_state#>>'{pause,reason}'='inactivity' THEN UPDATE public.players SET sitting_out=true,sit_out_next_hand=true WHERE id=(p_state#>>'{hand,active}')::uuid;END IF;
  PERFORM public.set_game_paused(g.id,true,p_match,g.pause_version);
 END IF;
 IF command IS NOT NULL THEN INSERT INTO private.canasta_receipts VALUES(p_match,request,actor,command,(p_state->>'revision')::bigint);END IF;
 RETURN public.canasta_server_load(p_match,actor);
END $$;
CREATE OR REPLACE FUNCTION private.canasta_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.canasta_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);s jsonb;episode bigint;remaining bigint;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'canasta' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.canasta_matches WHERE dealer_game_id=NEW.current_game_uuid FOR UPDATE;
 IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL THEN RETURN NEW;END IF;s:=m.state;
 IF NEW.is_paused THEN
  IF nullif(s->'pause','null'::jsonb) IS NOT NULL THEN RETURN NEW;END IF;
  episode:=(s->>'pauseEpisode')::bigint+1;remaining:=greatest(0,(s#>>'{hand,deadline}')::bigint-at_ms);
  s:=s||jsonb_build_object('pauseEpisode',episode,'pause',jsonb_build_object('at',at_ms,'remaining',remaining,'expired',remaining=0,'episode',episode,'reason','manual'));
 ELSE
  IF NEW.real_money AND EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=NEW.id AND p.sitting_out AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) seat WHERE seat->>'id'=p.id::text)) THEN RAISE EXCEPTION 'canasta:return_players_before_resume';END IF;
  IF nullif(s->'pause','null'::jsonb) IS NULL THEN RAISE EXCEPTION 'canasta:pause_identity';END IF;
  IF s->'hand'<>'null'::jsonb THEN
   remaining:=CASE WHEN (s#>>'{pause,expired}')::boolean THEN coalesce((s#>>'{config,turnMs}')::bigint,(private.canasta_rules()->>'turnMs')::bigint) ELSE (s#>>'{pause,remaining}')::bigint END;
   s:=jsonb_set(jsonb_set(s,'{hand,deadline}',to_jsonb(at_ms+remaining)),'{hand,generation}',to_jsonb((s#>>'{hand,generation}')::bigint+1));
  END IF;
  s:=s||'{"pause":null}'::jsonb;
 END IF;
 UPDATE private.canasta_matches SET state=s||jsonb_build_object('revision',m.revision+1,'updatedAt',at_ms),revision=m.revision+1,
  bot_due_at=CASE WHEN NOT NEW.is_paused THEN at_ms+750 END WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
