SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='30s';
ALTER TABLE private.ptown_words_release ADD COLUMN bots_enabled boolean NOT NULL DEFAULT false;
DO $guard$ BEGIN IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='ptown_words_configure' AND n.nspname='public') IS DISTINCT FROM '308b07b2153cdc462cc2938c0d3070d0' THEN RAISE EXCEPTION 'Ptown Words bot preimage changed: ptown_words_configure';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.ptown_words_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.ptown_words_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'ptown-words' THEN RAISE EXCEPTION 'ptown_words:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'ptown_words:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'ptown_words:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'ptown_words:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'ptown_words:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'ptown_words:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'ptown_words:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.ptown_words_actor_allowed(user_id)) THEN RAISE EXCEPTION 'ptown_words:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'ptown_words:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'ptown_words:player_count';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND bots_enabled)) THEN RAISE EXCEPTION 'ptown_words:bots_fake_money_only';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'ptown_words:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'ptown-words',jsonb_build_object('ante_amount',stake_i,'rules',private.ptown_words_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='ptown-words',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
DO $guard$ BEGIN IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='megatouch_begin' AND n.nspname='private') IS DISTINCT FROM 'ebdd4a87baf2594eed4ea14ff4a2bc37' THEN RAISE EXCEPTION 'Ptown Words bot preimage changed: megatouch_begin';END IF;END $guard$;
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
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 IF g.game_type='quintzee' AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND enabled AND admission_enabled)) THEN RAISE EXCEPTION 'quintzee:fake_money_admission_closed' USING ERRCODE='42501';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type IN('ptown-words','quintzee') THEN 4 WHEN g.game_type IN('run21','trip-flip','boxdrop','race-poker','battle-31') THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
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
  IF g.game_type='ptown-words' THEN
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
-- A bounded policy over public board + the acting bot's rack. Rules remain /1.
CREATE OR REPLACE FUNCTION private.ptown_words_bot_choice(visible jsonb,at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE board jsonb:=visible->'board';rack jsonb:=visible->'rack';version_i text:=visible#>>'{rules,dictionaryId}';
 player text:=visible->>'activePlayerId';simulation jsonb;trial jsonb;best jsonb;best_score int:=-1;
 starts jsonb:='[]';entry jsonb;stack jsonb[];node jsonb;remaining jsonb;placements jsonb;prefix text;first_word text;
 direction_i int;lane int;offset_i int;start_i int;end_i int;step_i int;position_i int;next_i int;sq int;r int;c int;rr int;cc int;
 empties int;distance_i int;anchor boolean;connected boolean;empty_board boolean;face text;letter text;cross_word text;seen text;
 tile jsonb;tile_i int;letter_i int;nodes int:=0;candidates int:=0;score_i int;rack_count int:=jsonb_array_length(rack);
BEGIN
 IF visible?'bag' OR visible?'racks' THEN RAISE EXCEPTION 'ptown_words:bot_private_input';END IF;
 IF visible->>'phase'<>'playing' OR rack_count=0 THEN RETURN jsonb_build_object('action','pass','items',NULL);END IF;
 empty_board:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements(board)b WHERE b<>'null'::jsonb);
 -- Only the public projection is used to construct trial moves. Empty simulated
 -- opponent racks/bag prevent any hidden draw information reaching the policy.
 -- Read event.points only; the real reducer performs the real draw and endgame.
 simulation:=visible||jsonb_build_object('bag','[]'::jsonb,'racks',(SELECT jsonb_object_agg(p->>'id',CASE WHEN p->>'id'=player THEN rack ELSE '[]'::jsonb END) FROM jsonb_array_elements(visible->'players')p));
 FOR direction_i IN 0..1 LOOP
  step_i:=CASE WHEN direction_i=0 THEN 1 ELSE 15 END;
  FOR lane IN 0..14 LOOP FOR offset_i IN 0..14 LOOP
   start_i:=CASE WHEN direction_i=0 THEN lane*15+offset_i ELSE offset_i*15+lane END;
   end_i:=CASE WHEN direction_i=0 THEN lane*15+14 ELSE 210+lane END;
   IF offset_i>0 AND board->(start_i-step_i)<>'null'::jsonb THEN CONTINUE;END IF;
   empties:=0;anchor:=false;distance_i:=0;
   FOR position_i IN offset_i..14 LOOP
    sq:=start_i+(position_i-offset_i)*step_i;r:=sq/15;c:=sq%15;
    IF board->sq='null'::jsonb THEN empties:=empties+1;END IF;
    EXIT WHEN empties>rack_count;
    IF (empty_board AND sq=112) OR (NOT empty_board AND (board->sq<>'null'::jsonb OR
     (r>0 AND board->(sq-15)<>'null'::jsonb) OR (r<14 AND board->(sq+15)<>'null'::jsonb) OR
     (c>0 AND board->(sq-1)<>'null'::jsonb) OR (c<14 AND board->(sq+1)<>'null'::jsonb))) THEN anchor:=true;EXIT;END IF;
    distance_i:=distance_i+1;
   END LOOP;
   IF anchor THEN starts:=starts||jsonb_build_array(jsonb_build_object('start',start_i,'end',end_i,'step',step_i,'distance',distance_i));END IF;
  END LOOP;END LOOP;
 END LOOP;
 <<search>>
 FOR entry IN SELECT value FROM jsonb_array_elements(starts) ORDER BY (value->>'distance')::int,md5((value->>'start')||':'||(value->>'step')||':'||(visible->>'turn')) LOOP
  step_i:=(entry->>'step')::int;end_i:=(entry->>'end')::int;
  stack:=ARRAY[jsonb_build_object('pos',(entry->>'start')::int,'prefix','','rack',rack,'items','[]'::jsonb,'connected',false)];
  WHILE cardinality(stack)>0 LOOP
   node:=stack[cardinality(stack)];stack:=stack[1:cardinality(stack)-1];nodes:=nodes+1;EXIT search WHEN nodes>8000 OR candidates>=48;
   position_i:=(node->>'pos')::int;prefix:=node->>'prefix';remaining:=node->'rack';placements:=node->'items';connected:=(node->>'connected')::boolean;
   SELECT word INTO first_word FROM private.ptown_words_lexicon WHERE version=version_i AND word>=prefix COLLATE "C" AND word<(prefix||'[') COLLATE "C" ORDER BY word LIMIT 1;
   IF first_word IS NULL THEN CONTINUE;END IF;
   IF first_word=prefix AND length(prefix)>1 AND jsonb_array_length(placements)>0 AND connected AND (position_i>end_i OR board->position_i='null'::jsonb) THEN
    BEGIN
     trial:=private.ptown_words_reduce(simulation,'place',placements,at_ms);score_i:=(trial#>>'{event,points}')::int;candidates:=candidates+1;
     IF score_i>best_score THEN best_score:=score_i;best:=jsonb_build_object('action','place','items',placements);END IF;
    EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'ptown_words:%' THEN RAISE;END IF;
    END;
   END IF;
   IF position_i>end_i THEN CONTINUE;END IF;
   next_i:=position_i+step_i;
   IF board->position_i<>'null'::jsonb THEN
    stack:=array_append(stack,node||jsonb_build_object('pos',next_i,'prefix',prefix||(board->position_i->>'letter'),'connected',true));CONTINUE;
   END IF;
   seen:='';r:=position_i/15;c:=position_i%15;
   FOR tile_i IN 0..jsonb_array_length(remaining)-1 LOOP
    tile:=remaining->tile_i;face:=tile->>'face';IF strpos(seen,face)>0 THEN CONTINUE;END IF;seen:=seen||face;
    FOR letter_i IN 0..CASE WHEN face='?' THEN 25 ELSE 0 END LOOP
     letter:=CASE WHEN face='?' THEN chr(65+letter_i) ELSE face END;
     cross_word:=letter;rr:=r-CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=c-CASE WHEN step_i=15 THEN 1 ELSE 0 END;
     WHILE rr>=0 AND cc>=0 AND board->(rr*15+cc)<>'null'::jsonb LOOP cross_word:=(board->(rr*15+cc)->>'letter')||cross_word;rr:=rr-CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=cc-CASE WHEN step_i=15 THEN 1 ELSE 0 END;END LOOP;
     rr:=r+CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=c+CASE WHEN step_i=15 THEN 1 ELSE 0 END;
     WHILE rr<15 AND cc<15 AND board->(rr*15+cc)<>'null'::jsonb LOOP cross_word:=cross_word||(board->(rr*15+cc)->>'letter');rr:=rr+CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=cc+CASE WHEN step_i=15 THEN 1 ELSE 0 END;END LOOP;
     IF length(cross_word)>1 AND NOT EXISTS(SELECT 1 FROM private.ptown_words_lexicon WHERE version=version_i AND word=cross_word) THEN CONTINUE;END IF;
     stack:=array_append(stack,jsonb_build_object('pos',next_i,'prefix',prefix||letter,'rack',remaining-tile_i,'items',placements||jsonb_build_array(jsonb_build_object('tileId',(tile->>'id')::int,'square',position_i,'letter',letter)),'connected',connected OR length(cross_word)>1 OR (empty_board AND position_i=112)));
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP search;
 IF best IS NOT NULL THEN RETURN best;END IF;
 -- One exchange attempt before passing prevents a no-word bot recycling forever.
 IF (visible->>'bagCount')::int>=7 AND coalesce((SELECT move->>'action' FROM jsonb_array_elements(visible->'moves') WITH ORDINALITY t(move,seq) WHERE move->>'playerId'=player ORDER BY seq DESC LIMIT 1),'')<>'exchange' THEN
  RETURN jsonb_build_object('action','exchange','items',(SELECT jsonb_agg(jsonb_build_object('tileId',t->'id')) FROM jsonb_array_elements(rack)t));
 END IF;
 RETURN jsonb_build_object('action','pass','items',NULL);
END $$;
REVOKE ALL ON FUNCTION private.ptown_words_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ptown_words_schedule_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
  OR NEW.state->>'phase' NOT IN ('ready','playing')
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN
  NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.ptown_words_recover(p_dealer_game_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.ptown_words_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.ptown_words_matches work JOIN public.games live ON live.id=work.game_id
  WHERE (p_dealer_game_id IS NULL OR work.dealer_game_id=p_dealer_game_id) AND NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.status='in_progress' AND live.game_type='ptown-words'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 2 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'ptown-words' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.ptown_words_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   m.state:=private.ptown_words_reduce(m.state,'tick',NULL,at_ms);
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   IF g.real_money IS DISTINCT FROM false THEN CONTINUE;END IF;
   choice:=private.ptown_words_bot_choice(private.ptown_words_visible(m.state,actor::text),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.ptown_words_reduce(m.state,choice->>'action',choice->'items',at_ms);
  END IF;
  UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.ptown_words_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.ptown_words_matches WHERE (p_dealer_game_id IS NULL OR dealer_game_id=p_dealer_game_id) AND NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.ptown_words_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;
CREATE TRIGGER ptown_words_bot_schedule BEFORE INSERT OR UPDATE ON private.ptown_words_matches FOR EACH ROW EXECUTE FUNCTION private.ptown_words_schedule_bot();
REVOKE ALL ON FUNCTION private.ptown_words_schedule_bot(),private.ptown_words_recover(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ptown_words_recover() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.ptown_words_recover(NULL::uuid) $$;
REVOKE ALL ON FUNCTION private.ptown_words_recover() FROM PUBLIC,anon,authenticated,service_role;
