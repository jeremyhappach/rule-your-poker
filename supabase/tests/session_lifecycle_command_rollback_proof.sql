BEGIN;
DO $proof$
DECLARE users uuid[]; administrator uuid; g uuid; dg uuid; next_dg uuid; p uuid; peer uuid; r jsonb; gen bigint; kind text; key text; denied boolean; ctx text; before_state jsonb;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 2) q;
 SELECT p.id INTO administrator FROM public.profiles p JOIN auth.users a ON a.id=p.id WHERE public.has_role(p.id,'admin') ORDER BY p.id LIMIT 1;
 IF cardinality(users)<2 OR administrator IS NULL THEN RAISE EXCEPTION 'proof:auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money) VALUES('Forged active session','in_progress',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:forged_genesis'; END IF;
 r:=public.create_session(gen_random_uuid(),'Rollback empty fake',false,1);
 g:=(r->>'game_id')::uuid; SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'deleted' THEN RAISE EXCEPTION 'proof:orphan_creation_cleanup:%',r; END IF;
 r:=public.request_session_end(g,NULL,gen);
 IF NOT (r->>'already_terminal')::boolean THEN RAISE EXCEPTION 'proof:delete_replay'; END IF;
 r:=public.create_session(gen_random_uuid(),'Rollback real archive',true,1);
 g:=(r->>'game_id')::uuid; p:=(r->>'player_id')::uuid; SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 denied:=false; BEGIN UPDATE public.games SET pending_session_end=true WHERE id=g; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_lifecycle'; END IF;
 denied:=false; BEGIN DELETE FROM public.games WHERE id=g; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_delete'; END IF;
 denied:=false; BEGIN PERFORM public.admin_set_maintenance_mode(true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:maintenance_nonadmin'; END IF;
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'session_ended' OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:real_archive'; END IF;
 EXECUTE 'RESET ROLE';

 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host) VALUES('Rollback lifecycle '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g RETURNING timer_generation INTO gen;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  denied:=false; BEGIN PERFORM public.request_session_end(g,dg,gen); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:peer_can_end:%',kind; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.request_session_end(g,NULL,gen);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  r:=public.request_session_end(g,dg,gen+1);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_generation'; END IF;
  r:=public.request_session_end(g,dg,gen);
  IF r->>'terminal_disposition'<>'pending_session_end' OR (SELECT status FROM public.games WHERE id=g)<>'in_progress' THEN RAISE EXCEPTION 'proof:active_disposition:%:%',kind,r; END IF;
  r:=public.request_session_end(g,dg,gen);
  IF r->>'terminal_disposition'<>'pending_session_end' THEN RAISE EXCEPTION 'proof:duplicate_active'; END IF;
  EXECUTE 'RESET ROLE';
  -- A terminal receipt is trusted only for the exact current dealer game and hand.
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  UPDATE public.games SET status='game_over',pending_session_end=false WHERE id=g RETURNING timer_generation INTO gen;
  key:=CASE kind WHEN '3-5-7' THEN 'three_five_seven_terminal' WHEN 'horses' THEN 'horses_terminal' WHEN 'ship-captain-crew' THEN 'horses_terminal' WHEN 'cribbage' THEN 'cribbage_terminal' WHEN 'gin-rummy' THEN 'gin_rummy_terminal' WHEN 'yahtzee' THEN 'yahtzee_terminal' END;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.request_session_end(g,dg,gen);
  IF r->>'terminal_disposition'<>'pending_session_end' THEN RAISE EXCEPTION 'proof:unsettled_game_over_ended'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,settlement_key,event_kind,pot_won,player_chip_changes)
   VALUES(g,dg,1,kind,key,CASE WHEN kind='holm-game' THEN 'chucky_final_award'::public.holm_event_kind ELSE NULL END,0,'{}');
  PERFORM set_config('app.three_five_seven_authoritative_write','',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.request_session_end(g,dg,gen);
  IF r->>'terminal_disposition'<>'session_ended' THEN RAISE EXCEPTION 'proof:settled_end:%:%',kind,r; END IF;
  r:=public.request_session_end(g,dg,gen);
  IF NOT (r->>'already_terminal')::boolean THEN RAISE EXCEPTION 'proof:terminal_replay'; END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR (SELECT count(*) FROM public.game_results WHERE game_id=g)<>1 THEN RAISE EXCEPTION 'proof:money_mutated'; END IF;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
   IF coalesce(current_setting(ctx,true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak'; END IF;
  END LOOP;
  -- Restore only this synthetic fixture to a later dealer game to prove late replay.
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO next_dg;
  UPDATE public.games SET status='in_progress',current_game_uuid=next_dg,pending_session_end=false WHERE id=g;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.request_session_end(g,dg,gen);
  IF r->>'outcome'<>'stale_identity' OR (SELECT pending_session_end FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:late_replay'; END IF;
  EXECUTE 'RESET ROLE';
  -- Config expiry is a trusted server transition in every family.
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  UPDATE public.games SET status='game_selection',current_game_uuid=NULL,config_complete=false,config_deadline=clock_timestamp()-interval '1 second',dealer_position=1 WHERE id=g;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.handle_config_deadline_timeout(g);
  IF r->>'outcome'<>'waiting' THEN RAISE EXCEPTION 'proof:config_timeout:%:%',kind,r; END IF;
  EXECUTE 'RESET ROLE';
 END LOOP;
 IF has_function_privilege('authenticated','public.holm_request_session_end(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.three_five_seven_request_session_end(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.resolve_postgame_participation(uuid)','EXECUTE') THEN RAISE EXCEPTION 'proof:legacy_api_open'; END IF;
 -- Only disable maintenance in the public admin proof: enabling it would touch
 -- unrelated live sessions. Per-session close/drain behavior is proved above.
 PERFORM set_config('request.jwt.claim.sub',administrator::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN UPDATE public.system_settings s SET value='{"enabled":true}' WHERE s.key='maintenance_mode'; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_maintenance'; END IF;
 r:=public.admin_set_maintenance_mode(false);
 IF (r->>'enabled')::boolean THEN RAISE EXCEPTION 'proof:admin_maintenance'; END IF;
 EXECUTE 'RESET ROLE';
END $proof$;
ROLLBACK;
