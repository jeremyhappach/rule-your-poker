-- Normal multiplayer admission. Existing permissions, rules and financial owners remain intact.
DO $$ BEGIN
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tri_towers_capabilities') IS DISTINCT FROM '40e76cf9ed10cd90e24ee72049cb4154' THEN RAISE EXCEPTION 'money_admission:owner_drift_tri_towers_capabilities';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='royal_flash_settle') IS DISTINCT FROM 'c89c59f732fa065e96560ef805d53e44' THEN RAISE EXCEPTION 'money_admission:owner_drift_royal_flash_settle';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='royal_flash_configure') IS DISTINCT FROM 'abfa166490cdf625c6b2e0c51cea92fc' THEN RAISE EXCEPTION 'money_admission:owner_drift_royal_flash_configure';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='eleven_up_settle') IS DISTINCT FROM '1dcff44b96b998afd3c32eecbaa447a9' THEN RAISE EXCEPTION 'money_admission:owner_drift_eleven_up_settle';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='eleven_up_capabilities') IS DISTINCT FROM 'c6b644649974c14c5712ab7ddc315ee9' THEN RAISE EXCEPTION 'money_admission:owner_drift_eleven_up_capabilities';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='eleven_up_action') IS DISTINCT FROM 'd45bf681fd471b862820d5b117beddcf' THEN RAISE EXCEPTION 'money_admission:owner_drift_eleven_up_action';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='royal_flash_capabilities') IS DISTINCT FROM 'ca66a9be4208590ec66ec519763b9d20' THEN RAISE EXCEPTION 'money_admission:owner_drift_royal_flash_capabilities';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='royal_flash_action') IS DISTINCT FROM '50887cef3e2a2e02a885273aa85422f2' THEN RAISE EXCEPTION 'money_admission:owner_drift_royal_flash_action';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='eleven_up_configure') IS DISTINCT FROM '10e6087bd0540d718e49570625b53477' THEN RAISE EXCEPTION 'money_admission:owner_drift_eleven_up_configure';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='tri_towers_recover') IS DISTINCT FROM '12381899412cbdcd3ce53a9491130c03' THEN RAISE EXCEPTION 'money_admission:owner_drift_tri_towers_recover';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='royal_flash_recover') IS DISTINCT FROM 'f3e6637f00f1a87e041fde3161dd0b3f' THEN RAISE EXCEPTION 'money_admission:owner_drift_royal_flash_recover';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tri_towers_action') IS DISTINCT FROM '381dfbcad3fa52f1e9541a5ed9c16e19' THEN RAISE EXCEPTION 'money_admission:owner_drift_tri_towers_action';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='eleven_up_recover') IS DISTINCT FROM 'afb0e2512f6cee94f402ece5861cd76b' THEN RAISE EXCEPTION 'money_admission:owner_drift_eleven_up_recover';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='tri_towers_settle') IS DISTINCT FROM '4c24f4af6836f4e3ba6f127076b8851c' THEN RAISE EXCEPTION 'money_admission:owner_drift_tri_towers_settle';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tri_towers_configure') IS DISTINCT FROM 'a37800be938de6633192f29f68b3ee0a' THEN RAISE EXCEPTION 'money_admission:owner_drift_tri_towers_configure';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.tri_towers_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.tri_towers_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.tri_towers_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.tri_towers_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
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
CREATE OR REPLACE FUNCTION private.tri_towers_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.tri_towers_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'tri-towers' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'tri_towers:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'tri_towers:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'tri_towers_terminal','tri-towers',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'TriTowers: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.tri_towers_matches SET settlement=changes,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='TriTowers complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_action(p_dealer_game_id uuid, p_request_id uuid, p_revision bigint, p_action text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.tri_towers_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.tri_towers_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'index',p_index); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.tri_towers_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'tri_towers:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('start','remove','draw','continue','give_up','take_score') THEN RAISE EXCEPTION 'tri_towers:invalid_command'; END IF;
 SELECT * INTO prior FROM private.tri_towers_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'tri_towers:replay_conflict'; END IF;
  RETURN public.tri_towers_snapshot(p_dealer_game_id);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'tri_towers:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'tri_towers:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'tri_towers:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.tri_towers_reduce(m.state,p_action,p_index,at_ms);
 INSERT INTO private.tri_towers_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.tri_towers_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.tri_towers_settle(m.dealer_game_id); END IF;
 RETURN public.tri_towers_snapshot(m.dealer_game_id);
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.tri_towers_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.tri_towers_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.status='in_progress' AND live.game_type='tri-towers'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.tri_towers_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   m.state:=private.tri_towers_reduce(m.state,'tick',NULL,at_ms);
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.tri_towers_bot_choice(private.tri_towers_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.tri_towers_reduce(m.state,choice->>'action',(choice->>'index')::integer,at_ms);
  END IF;
  UPDATE private.tri_towers_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.tri_towers_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 RETURN count_i;
END $function$
;
CREATE OR REPLACE FUNCTION public.eleven_up_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.eleven_up_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.eleven_up_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
END $function$
;
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
CREATE OR REPLACE FUNCTION private.eleven_up_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.eleven_up_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'eleven_up:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'eleven_up:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'eleven_up_terminal','eleven-up',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  '11 Up: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.eleven_up_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements',private.eleven_up_record_scores(m.dealer_game_id))) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='11 Up complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.eleven_up_action(p_dealer_game_id uuid, p_request_id uuid, p_revision bigint, p_action text, p_items integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.eleven_up_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.eleven_up_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.eleven_up_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'eleven_up:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('group','pass','continue','take_score') THEN RAISE EXCEPTION 'eleven_up:invalid_command'; END IF;
 SELECT * INTO prior FROM private.eleven_up_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'eleven_up:replay_conflict'; END IF;
  RETURN public.eleven_up_snapshot(p_dealer_game_id);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'eleven_up:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'eleven_up:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'eleven_up:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.eleven_up_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.eleven_up_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id); END IF;
 RETURN public.eleven_up_snapshot(m.dealer_game_id);
END $function$
;
CREATE OR REPLACE FUNCTION private.eleven_up_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record;m private.eleven_up_matches;g public.games;at_ms bigint;count_i integer:=0;i integer;
BEGIN
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 FOR candidate IN SELECT dealer_game_id,game_id,round_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND (state->>'deadline')::bigint<=at_ms ORDER BY (state->>'deadline')::bigint LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress' OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  FOR i IN 1..64 LOOP
   EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
   m.state:=private.eleven_up_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
  END LOOP;
  UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id);END IF;count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
  PERFORM private.eleven_up_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;
 END LOOP;RETURN count_i;
END $function$
;
CREATE OR REPLACE FUNCTION public.royal_flash_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.royal_flash_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.royal_flash_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.royal_flash_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
END $function$
;
CREATE OR REPLACE FUNCTION public.royal_flash_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.royal_flash_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'royal-flash' THEN RAISE EXCEPTION 'royal_flash:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'royal_flash:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'royal_flash:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'royal_flash:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'royal_flash:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.royal_flash_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'royal_flash:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'royal_flash:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.royal_flash_actor_allowed(user_id)) THEN RAISE EXCEPTION 'royal_flash:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'royal_flash:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'royal_flash:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'royal_flash:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'royal-flash',jsonb_build_object('ante_amount',stake_i,'rules',private.royal_flash_rules_v3())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='royal-flash',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.royal_flash_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.royal_flash_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.royal_flash_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'royal-flash' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'royal_flash:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'royal_flash:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'royal_flash_terminal','royal-flash',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Royal Flash: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.royal_flash_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements',private.royal_flash_record_scores(m.dealer_game_id))) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Royal Flash complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.royal_flash_action(p_dealer_game_id uuid, p_request_id uuid, p_revision bigint, p_action text, p_items integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.royal_flash_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.royal_flash_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.royal_flash_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.royal_flash_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.royal_flash_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'royal_flash:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('place','continue','take_score') THEN RAISE EXCEPTION 'royal_flash:invalid_command'; END IF;
 SELECT * INTO prior FROM private.royal_flash_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'royal_flash:replay_conflict'; END IF;
  RETURN public.royal_flash_snapshot(p_dealer_game_id);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'royal-flash' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'royal_flash:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'royal_flash:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'royal_flash:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.royal_flash_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.royal_flash_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.royal_flash_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.royal_flash_settle(m.dealer_game_id); END IF;
 RETURN public.royal_flash_snapshot(m.dealer_game_id);
END $function$
;
CREATE OR REPLACE FUNCTION private.royal_flash_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.royal_flash_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.royal_flash_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.status='in_progress' AND live.game_type='royal-flash'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'royal-flash' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.royal_flash_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   FOR i IN 1..64 LOOP
 EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
 m.state:=private.royal_flash_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
 END LOOP;
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.royal_flash_bot_choice(private.royal_flash_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.royal_flash_reduce(m.state,choice->>'action',ARRAY[(choice->>'index')::integer],at_ms);
  END IF;
  UPDATE private.royal_flash_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.royal_flash_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.royal_flash_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.royal_flash_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;

-- Open independently only after client publication and qualification. Existing play remains available.
UPDATE private.tri_towers_release SET admission_enabled=false WHERE singleton;
UPDATE private.eleven_up_release SET admission_enabled=false WHERE singleton;
UPDATE private.royal_flash_release SET admission_enabled=false WHERE singleton;
NOTIFY pgrst,'reload schema';
