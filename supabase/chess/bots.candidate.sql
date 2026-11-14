-- Guarded forward migration; bot admission stays closed until worker qualification.
DO $$ BEGIN IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname='private.megatouch_begin') IS DISTINCT FROM '22ce654fd97085485f7d84d010cadf7b' THEN RAISE EXCEPTION 'chess:bot_baseline_changed private.megatouch_begin'; END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname='public.chess_commit') IS DISTINCT FROM '708cd0548eee071a8069b24679ff2d9c' THEN RAISE EXCEPTION 'chess:bot_baseline_changed public.chess_commit'; END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname='private.chess_seed') IS DISTINCT FROM 'b09ab6a68fcd55b668aae6ba949a5c09' THEN RAISE EXCEPTION 'chess:bot_baseline_changed private.chess_seed'; END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname='public.chess_configure') IS DISTINCT FROM '8e547a5c0885f391c06c9d5eae5e8e30' THEN RAISE EXCEPTION 'chess:bot_baseline_changed public.chess_configure'; END IF; END $$;
ALTER TABLE public.game_defaults ADD COLUMN chess_bot_difficulty text NOT NULL DEFAULT 'medium' CHECK(chess_bot_difficulty IN ('easy','medium','expert'));
ALTER TABLE private.chess_release DROP CONSTRAINT chess_release_bots_enabled_check;
-- Adapted from the established Canasta recovery lease. No browser bot authority.
CREATE TABLE private.chess_bot_recovery(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),token uuid,expires_at timestamptz,claimed boolean NOT NULL DEFAULT false,last_completed_at timestamptz,failure text,matches uuid[] NOT NULL DEFAULT '{}');
INSERT INTO private.chess_bot_recovery DEFAULT VALUES;
ALTER TABLE private.chess_bot_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.chess_bot_recovery FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX chess_bot_due ON private.chess_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND state ? 'bot';

CREATE FUNCTION private.chess_bot_health() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM cron.job WHERE jobname='chess-bot-recovery' AND active AND schedule='5 seconds') OR NOT EXISTS(SELECT FROM private.chess_bot_recovery WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'chess:bot_recovery_unhealthy';END IF;
END $$;
CREATE FUNCTION private.chess_dispatch_bots() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.chess_bot_recovery;t uuid:=gen_random_uuid();
BEGIN
 -- Keep already-admitted bot games recoverable if new bot admission is closed.
 IF NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND bots_enabled) AND NOT EXISTS(SELECT FROM private.chess_matches WHERE NOT finished AND settlement IS NULL AND state ? 'bot') THEN RETURN;END IF;
 SELECT * INTO STRICT s FROM private.chess_bot_recovery WHERE singleton FOR UPDATE;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN RETURN;END IF;
 UPDATE private.chess_bot_recovery SET token=t,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,matches='{}',failure=CASE WHEN s.token IS NOT NULL THEN 'chess:bot_lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/chess-recovery',headers:=jsonb_build_object('Content-Type','application/json','x-chess-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
END $$;
CREATE FUNCTION public.chess_bot_claim(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 PERFORM 1 FROM private.chess_bot_recovery WHERE singleton AND token=p_token AND NOT claimed AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"accepted":false}'::jsonb;END IF;
 SELECT coalesce(array_agg(dealer_game_id),'{}'::uuid[]) INTO ids FROM (
  SELECT m.dealer_game_id FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id
  WHERE NOT m.finished AND m.settlement IS NULL AND m.paused_at IS NULL AND m.state ? 'bot' AND g.real_money=false AND NOT g.is_paused
   AND m.state->>'phase'='playing' AND (m.state->'players'->(m.state->>'turnIndex')::int->>'isBot')::boolean
   AND (m.state->>'deadline')::bigint-(m.state->>'clockDuration')::bigint+1000<=at_ms
  ORDER BY (m.state->>'deadline')::bigint,m.dealer_game_id LIMIT 1
 ) due;
 UPDATE private.chess_bot_recovery SET claimed=true,matches=ids WHERE singleton;
 RETURN jsonb_build_object('accepted',true,'matches',ids);
END $$;
CREATE FUNCTION private.chess_bot_assert_lease(p_token uuid,p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM private.chess_bot_recovery WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp() AND p_id=ANY(matches) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'chess:recovery_token_denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.chess_bot_load(p_token uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.chess_matches;
BEGIN
 PERFORM private.chess_bot_assert_lease(p_token,p_id);PERFORM private.chess_sync('live',p_id);
 SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=p_id;
 IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.state->>'phase'<>'playing' OR NOT (m.state->'players'->(m.state->>'turnIndex')::int->>'isBot')::boolean THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state',m.state,'revision',m.revision,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
END $$;
CREATE FUNCTION public.chess_bot_commit(p_token uuid,p_id uuid,p_revision bigint,p_actor uuid,p_state jsonb,p_intent jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.chess_bot_assert_lease(p_token,p_id);
 IF p_intent->>'type' IS DISTINCT FROM 'move' THEN RAISE EXCEPTION 'chess:bot_move_required';END IF;
 RETURN private.chess_commit_impl('live',p_id,p_actor,p_revision,p_state,p_token,jsonb_build_object('revision',p_revision,'intent',p_intent),true);
END $$;
CREATE FUNCTION public.chess_bot_complete(p_token uuid,p_failure text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.chess_bot_recovery SET token=NULL,claimed=false,matches='{}',failure=left(p_failure,160),last_completed_at=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_completed_at END WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'chess:recovery_token_denied' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION private.chess_bot_health(),private.chess_dispatch_bots(),private.chess_bot_assert_lease(uuid,uuid),public.chess_bot_claim(uuid),public.chess_bot_load(uuid,uuid),public.chess_bot_commit(uuid,uuid,bigint,uuid,jsonb,jsonb),public.chess_bot_complete(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.chess_bot_claim(uuid),public.chess_bot_load(uuid,uuid),public.chess_bot_commit(uuid,uuid,bigint,uuid,jsonb,jsonb),public.chess_bot_complete(uuid,text) TO service_role;
SELECT cron.schedule('chess-bot-recovery','5 seconds','SELECT private.chess_dispatch_bots()');

CREATE OR REPLACE FUNCTION private.chess_seed(s jsonb, mode_i text, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE fen text:='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
BEGIN
 IF jsonb_array_length(s->'players')<>2 OR NOT EXISTS(SELECT FROM jsonb_array_elements(s->'players') p WHERE NOT (p->>'isBot')::boolean) OR (EXISTS(SELECT FROM jsonb_array_elements(s->'players') p WHERE (p->>'isBot')::boolean) AND (mode_i<>'live' OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND bots_enabled))) THEN RAISE EXCEPTION 'chess:two_humans_required';END IF;
 RETURN s||jsonb_build_object('rules',private.chess_rules(),'mode',mode_i,'backgroundId',private.choose_game_background(),'initialFen',fen,'fen',fen,'phase','playing','turnIndex',0,'turn',1,'opened',mode_i='live','clockDuration',(private.chess_rules()->>'turnMs')::bigint,'deadline',at_ms+(private.chess_rules()->>CASE WHEN mode_i='live' THEN 'turnMs' ELSE 'availabilityMs' END)::bigint,'moves','[]'::jsonb,'captured','{"w":[],"b":[]}'::jsonb,'banks',(SELECT jsonb_object_agg(p->>'id','[]'::jsonb) FROM jsonb_array_elements(s->'players') p),'positions',jsonb_build_array('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -||'),'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(s->'players') p),'winnerIds','[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION public.chess_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.chess_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'chess' THEN RAISE EXCEPTION 'chess:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF g.real_money IS DISTINCT FROM false AND NOT EXISTS(SELECT 1 FROM private.chess_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'chess:real_money_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'chess:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'chess:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'chess:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'chess:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.chess_release WHERE singleton AND enabled AND admission_enabled) THEN RAISE EXCEPTION 'chess:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'chess:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.chess_actor_allowed(user_id)) THEN RAISE EXCEPTION 'chess:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'chess:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) <>2 THEN RAISE EXCEPTION 'chess:player_count';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.chess_release WHERE singleton AND bots_enabled)) THEN RAISE EXCEPTION 'chess:bots_fake_money_only';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN PERFORM private.chess_bot_health();END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'chess:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'chess',jsonb_build_object('ante_amount',stake_i,'rules',private.chess_rules())||CASE WHEN EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN jsonb_build_object('bot',jsonb_build_object('version','ptown-chess-bot/1','difficulty',(SELECT chess_bot_difficulty FROM public.game_defaults WHERE game_type='chess'))) ELSE '{}'::jsonb END) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='chess',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.megatouch_begin(p_game uuid, p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games;dg public.dealer_games;r uuid:=gen_random_uuid();people jsonb;balances jsonb;s jsonb;stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('chess','ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 IF g.game_type='ptown-words' AND g.real_money IS DISTINCT FROM false AND NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'ptown_words:real_money_closed' USING ERRCODE='42501';END IF;
 IF g.game_type='quintzee' AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND enabled AND admission_enabled)) THEN RAISE EXCEPTION 'quintzee:fake_money_admission_closed' USING ERRCODE='42501';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type IN('chess','ptown-words','quintzee') THEN 4 WHEN g.game_type IN('chess','run21','trip-flip','boxdrop','race-poker','battle-31') THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
 -- 11 Up bots use canonical consent and the shared reducer.
IF g.game_type='eleven-up' AND g.real_money IS DISTINCT FROM false AND EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_fake_money_only';END IF;
 PERFORM set_config('app.cribbage_authoritative_write','on',true);PERFORM set_config('app.gin_rummy_authoritative_write','on',true);PERFORM set_config('app.three_five_seven_authoritative_write','on',true);PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 IF g.game_type='run21' THEN
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds)
  VALUES(p_dealer,p_game,r,people,stake_i,balances,balances,2,g.real_money,(dg.config->>'first_placement_seconds')::integer);
 ELSE
  s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'players',people,'rules',dg.config->'rules','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
  IF g.game_type='chess' THEN
   IF NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND enabled AND admission_enabled AND (NOT g.real_money OR real_qualified)) THEN RAISE EXCEPTION 'chess:admission_closed';END IF;
   IF EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN
    IF g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND bots_enabled) OR NOT EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:bots_fake_money_only';END IF;
    PERFORM private.chess_bot_health();
    IF dg.config#>>'{bot,version}' IS DISTINCT FROM 'ptown-chess-bot/1' OR coalesce(dg.config#>>'{bot,difficulty}','') NOT IN ('easy','medium','expert') THEN RAISE EXCEPTION 'chess:bot_difficulty';END IF;
    s:=s||jsonb_build_object('bot',dg.config->'bot');
   END IF;
   s:=private.chess_seed(s,'live',floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.chess_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='ptown-words' THEN
   IF (EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND bots_enabled))) OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled) THEN RAISE EXCEPTION 'ptown_words:admission_closed';END IF;
   s:=private.ptown_words_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.ptown_words_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='quintzee' THEN
   s:=private.quintzee_deal(s||jsonb_build_object('theme',dg.config->>'theme'),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.quintzee_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='battle-31' THEN
   IF NOT EXISTS(SELECT 1 FROM private.battle31_release WHERE singleton AND enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'battle31:admission_closed';END IF;
   s:=private.battle31_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.battle31_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='race-poker' THEN
   IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND enabled AND admission_enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'race_poker:admission_closed';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'race_poker:human_required';END IF;
   s:=private.race_poker_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.race_poker_matches(dealer_game_id,game_id,round_id,state,stake,real_money) VALUES(p_dealer,p_game,r,s,stake_i,g.real_money);
  ELSIF g.game_type='boxdrop' THEN
   s:=private.boxdrop_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.boxdrop_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='trip-flip' THEN
   s:=private.trip_flip_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.trip_flip_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='take-two' THEN
   s:=private.take_two_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.take_two_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='royal-flash' THEN
   s:=private.royal_flash_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.royal_flash_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='eleven-up' THEN
   s:=private.eleven_up_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSE
   s:=private.tri_towers_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  END IF;
 END IF;
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $function$
;
CREATE OR REPLACE FUNCTION private.chess_commit_impl(p_mode text, p_id uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_request uuid, p_fingerprint jsonb, p_bot boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE row_i jsonb;before_s jsonb;prior private.chess_requests;c private.delayed_children;winner uuid;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);changed_turn boolean;
BEGIN
 IF NOT p_bot THEN PERFORM private.chess_authorize(p_mode,p_id,p_actor);
 ELSIF p_mode<>'live' THEN RAISE EXCEPTION 'chess:bot_mode';END IF;
 PERFORM private.chess_sync(p_mode,p_id);
 row_i:=private.chess_record(p_mode,p_id,CASE WHEN p_bot THEN NULL ELSE p_actor END);before_s:=row_i->'state';
 IF p_bot THEN
  IF NOT EXISTS(SELECT FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id JOIN public.players p ON p.game_id=g.id WHERE m.dealer_game_id=p_id AND p.id=p_actor AND p.is_bot AND g.real_money=false)
    OR NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=p_actor::text AND (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:bot_actor';END IF;
  row_i:=row_i||jsonb_build_object('viewerId',p_actor);
 END IF;
 SELECT * INTO prior FROM private.chess_requests WHERE mode=p_mode AND match_id=p_id AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM p_actor OR prior.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'chess:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','duplicate','record',row_i);
 END IF;
 IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'chess:request_required';END IF;
 IF (row_i->>'revision')::bigint IS DISTINCT FROM p_revision OR (row_i->>'settled')::boolean OR (row_i->>'paused')::boolean OR before_s->>'phase'<>'playing' THEN RETURN jsonb_build_object('outcome','stale','record',row_i);END IF;
 IF before_s->'players'->(before_s->>'turnIndex')::int->>'id' IS DISTINCT FROM row_i->>'viewerId' THEN RAISE EXCEPTION 'chess:not_your_turn';END IF;
 IF p_state->'bot' IS DISTINCT FROM before_s->'bot' THEN RAISE EXCEPTION 'chess:bot_config_changed';END IF;
 IF p_state->'identity' IS DISTINCT FROM before_s->'identity' OR p_state->'rules' IS DISTINCT FROM before_s->'rules' OR p_state->'players' IS DISTINCT FROM before_s->'players' OR p_state->'backgroundId' IS DISTINCT FROM before_s->'backgroundId' OR p_state->'initialFen' IS DISTINCT FROM before_s->'initialFen' OR p_state->'mode' IS DISTINCT FROM before_s->'mode' THEN RAISE EXCEPTION 'chess:identity_changed';END IF;
 -- Only the authenticated Node authority can reach this full-state boundary.
 -- Enforce append-only moves and exact rule/config identity again under row lock.
 IF jsonb_array_length(p_state->'moves') NOT BETWEEN jsonb_array_length(before_s->'moves') AND jsonb_array_length(before_s->'moves')+1 OR EXISTS(SELECT FROM jsonb_array_elements(before_s->'moves') WITH ORDINALITY t(m,n) WHERE p_state->'moves'->(n::int-1) IS DISTINCT FROM m) THEN RAISE EXCEPTION 'chess:history_changed';END IF;
 IF p_state->>'phase'='complete' AND (jsonb_array_length(p_state->'winnerIds') NOT BETWEEN 1 AND 2 OR EXISTS(SELECT FROM jsonb_array_elements_text(p_state->'winnerIds') w WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=w))) THEN RAISE EXCEPTION 'chess:invalid_winner';END IF;
 IF p_mode='live' THEN
  UPDATE private.chess_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_id;
  IF p_state->>'phase'='complete' THEN PERFORM private.chess_settle(p_id);END IF;
 ELSE
  changed_turn:=p_state->'turn' IS DISTINCT FROM before_s->'turn';
  UPDATE private.delayed_children SET state=p_state,revision=revision+1,actor=(p_state->'players'->(p_state->>'turnIndex')::int->>'id')::uuid,
   segment=segment+CASE WHEN changed_turn THEN 1 ELSE 0 END,
   started_at=CASE WHEN changed_turn THEN NULL WHEN (p_state->>'opened')::boolean THEN coalesce(started_at,to_timestamp(at_ms/1000.0)) ELSE started_at END,
   available_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0) ELSE available_at END,
   last_call_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '24 hours' ELSE last_call_at END,
   expires_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '36 hours' ELSE expires_at END,
   gameplay_due_at=CASE WHEN (p_state->>'opened')::boolean THEN to_timestamp((p_state->>'deadline')::bigint/1000.0) END
   WHERE id=p_id RETURNING * INTO c;
  IF p_state->>'phase'='complete' THEN
   winner:=CASE WHEN jsonb_array_length(p_state->'winnerIds')=1 THEN (p_state->'winnerIds'->>0)::uuid END;
   PERFORM private.delayed_record_outcome(p_id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,jsonb_build_object('game','chess','reason',p_state->>'reason','fen',p_state->>'fen'));
  ELSE UPDATE private.delayed_matches SET revision=revision+1 WHERE id=c.match_id;PERFORM private.delayed_notify(c.match_id);END IF;
 END IF;
 INSERT INTO private.chess_requests VALUES(p_mode,p_id,p_request,p_actor,p_fingerprint);
 RETURN jsonb_build_object('outcome','committed','record',private.chess_record(p_mode,p_id,p_actor));
END $function$
;
CREATE OR REPLACE FUNCTION public.chess_commit(p_mode text,p_id uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_request uuid,p_fingerprint jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.chess_commit_impl(p_mode,p_id,p_actor,p_revision,p_state,p_request,p_fingerprint,false) $$;
REVOKE ALL ON FUNCTION private.chess_commit_impl(text,uuid,uuid,bigint,jsonb,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';