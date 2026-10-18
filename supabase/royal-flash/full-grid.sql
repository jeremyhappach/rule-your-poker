CREATE OR REPLACE FUNCTION private.royal_flash_rules_v2() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.royal_flash_rules()||'{"version":"royal-flash/2","autoFinishFullGrid":true}'::jsonb
$$;
REVOKE ALL ON FUNCTION private.royal_flash_rules_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.royal_flash_board_deal(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.royal_flash_shuffle();slots jsonb:=(SELECT jsonb_agg(NULL::integer) FROM generate_series(1,25));
BEGIN
 IF b->'rules' IS DISTINCT FROM private.royal_flash_rules() AND b->'rules' IS DISTINCT FROM private.royal_flash_rules_v2() THEN RAISE EXCEPTION 'royal_flash:ruleset_conflict';END IF;
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'slots',slots,'cursor',1,'current',deck->0,'placements',0,'handPoints',0,'lines',private.royal_flash_lines(slots,b->'rules'),
 'scoreBefore',coalesce((b->>'score')::bigint,0),'phase','intro','deadline',at_ms+(b#>>'{rules,introMs}')::bigint,'event',jsonb_build_object('label','Royal Flash','points',0));
END $$;

CREATE OR REPLACE FUNCTION private.royal_flash_board_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bonus bigint:=0;total bigint;result jsonb;full_i boolean;
BEGIN
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'slots')x WHERE x='null'::jsonb) INTO full_i;
 IF full_i AND reason IN('take_score','exhausted','full_grid') THEN bonus:=greatest(0,(b->>'deadline')::bigint-at_ms)/1000*(b#>>'{rules,timePerSecond}')::bigint;END IF;
 total:=(b->>'scoreBefore')::bigint+(b->>'handPoints')::bigint+bonus;
 result:=jsonb_build_object('scoreBefore',(b->>'scoreBefore')::bigint,'score',total,'displayScore',total,'stageScore',total-(b->>'scoreBefore')::bigint,'handPoints',(b->>'handPoints')::bigint,'timeBonus',bonus,'reason',reason,'completedAt',at_ms,'presentationMs',21000,'presentationVersion',2,'lines',b->'lines','slots',b->'slots');
 RETURN b||jsonb_build_object('score',total,'result',result,'phase','stage_complete','deadline',at_ms+greatest(21000,(b#>>'{rules,holdMs}')::bigint),
 'event',jsonb_build_object('label',CASE reason WHEN 'timeout' THEN 'Time expired' WHEN 'ready_timeout' THEN 'Round not started' WHEN 'exhausted' THEN 'Deck complete' WHEN 'full_grid' THEN 'Grid complete' ELSE 'Score taken' END,'points',bonus));
END $$;

CREATE OR REPLACE FUNCTION private.royal_flash_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text:=b->>'phase';slot integer;cursor_i integer;lines jsonb;points bigint;
BEGIN
 IF phase='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;ELSE RAISE EXCEPTION 'royal_flash:intro';END IF;END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint);phase:='ready';
 END IF;
 IF phase NOT IN('ready','playing') THEN RAISE EXCEPTION 'royal_flash:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.royal_flash_board_finish(b,CASE WHEN phase='ready' THEN 'ready_timeout' ELSE 'timeout' END,(b->>'deadline')::bigint);END IF;
 IF action='tick' THEN RETURN b;END IF;
 IF action='place' THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 24 OR b->'current'='null'::jsonb THEN RAISE EXCEPTION 'royal_flash:invalid_placement';END IF;
 ELSIF action<>'take_score' OR phase<>'playing' OR items IS NOT NULL THEN RAISE EXCEPTION 'royal_flash:invalid_action';END IF;
 IF phase='ready' THEN b:=b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,stageMs}')::bigint);END IF;
 IF action='take_score' THEN RETURN private.royal_flash_board_finish(b,'take_score',at_ms);END IF;
 slot:=items[1];cursor_i:=(b->>'cursor')::integer;
 b:=jsonb_set(b,ARRAY['slots',slot::text],b->'current');lines:=private.royal_flash_lines(b->'slots',b->'rules');
 SELECT sum((x->>'points')::bigint) INTO points FROM jsonb_array_elements(lines)x;
 b:=b||jsonb_build_object('lines',lines,'handPoints',points,'score',(b->>'scoreBefore')::bigint+points,'placements',(b->>'placements')::integer+1,
  'current',CASE WHEN cursor_i<52 THEN b->'deck'->cursor_i ELSE 'null'::jsonb END,'cursor',least(52,cursor_i+1),'event',jsonb_build_object('label','Card placed','points',points-(b->>'handPoints')::bigint,'slot',slot));
 IF b#>>'{rules,version}'='royal-flash/2' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'slots') x WHERE x='null'::jsonb) THEN RETURN private.royal_flash_board_finish(b,'full_grid',at_ms);END IF;
 IF cursor_i=52 THEN RETURN private.royal_flash_board_finish(b,'exhausted',at_ms);END IF;
 RETURN b;
END $$;
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
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'royal_flash:real_money_closed' USING ERRCODE='42501';END IF;
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
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'royal-flash',jsonb_build_object('ante_amount',stake_i,'rules',private.royal_flash_rules_v2())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='royal-flash',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text, ruleset text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') THEN 'tri-towers/2'
 WHEN game='run21' AND ruleset IN ('run21/2','run21/3') THEN 'run21/2' WHEN game='royal-flash' AND ruleset IN ('royal-flash/1','royal-flash/2') THEN 'royal-flash/1' ELSE ruleset END
$function$
;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) SELECT 'royal-flash/2','royal-flash',private.royal_flash_rules_v2(),enabled FROM private.arcade_rulesets WHERE id='royal-flash/1' ON CONFLICT(id) DO NOTHING;
