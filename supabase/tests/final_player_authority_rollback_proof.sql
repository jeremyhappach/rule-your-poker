BEGIN;
DO $proof$
DECLARE users uuid[]; req uuid:=gen_random_uuid(); g uuid; p uuid; peer uuid; dg uuid; rd uuid; r jsonb; v bigint;
 denied boolean; gen bigint; kind text; ctx text; before_count bigint;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
 WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 3) q;
 IF cardinality(users)<3 THEN RAISE EXCEPTION 'proof:three_auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 g:=(r->>'game_id')::uuid; p:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'created' OR (SELECT current_host FROM public.games WHERE id=g) IS DISTINCT FROM users[1]
 OR (SELECT count(*) FROM public.players WHERE game_id=g)<>1 OR (SELECT chips FROM public.players WHERE id=p)<>0
 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:atomic_genesis:%',r; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_created' OR (r->>'game_id')::uuid<>g THEN RAISE EXCEPTION 'proof:create_duplicate'; END IF;
 denied:=false; BEGIN PERFORM public.create_session(req,'Different payload',true,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_payload_replay'; END IF;
 SELECT count(*) INTO before_count FROM public.games;
 denied:=false; BEGIN PERFORM public.create_session(gen_random_uuid(),'Invalid seat',false,8); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR (SELECT count(*) FROM public.games)<>before_count THEN RAISE EXCEPTION 'proof:creation_failure_orphan'; END IF;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money) VALUES('Raw creation denied','waiting',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_genesis'; END IF;
 denied:=false; BEGIN UPDATE public.players SET auto_fold=true WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_gameplay'; END IF;
 denied:=false; BEGIN DELETE FROM public.players WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_delete'; END IF;
 denied:=false; BEGIN INSERT INTO public.players(game_id,user_id,chips,position) VALUES(g,users[1],0,3); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_player_genesis'; END IF;
 UPDATE public.players SET deck_color_mode='four_color' WHERE id=p;
 IF (SELECT deck_color_mode FROM public.players WHERE id=p)<>'four_color' THEN RAISE EXCEPTION 'proof:own_color'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.create_session(req,'Rollback atomic creation',false,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_actor_replay'; END IF;
 UPDATE public.players SET deck_color_mode='two_color' WHERE id=p;
 IF FOUND THEN RAISE EXCEPTION 'proof:peer_color'; END IF;
 r:=public.session_take_seat(g,4,NULL,NULL); peer:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'proof:admission'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'deleted' THEN RAISE EXCEPTION 'proof:fake_cleanup'; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_deleted' OR r->>'game_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:late_creation_resurrected'; END IF;
 EXECUTE 'RESET ROLE';

 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback automatic play '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
   VALUES(g,dg,1,1,'betting',0,jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p)) RETURNING id INTO rd;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  denied:=false; BEGIN PERFORM public.set_automatic_play(g,rd,dg,peer,0,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:peer_automatic_play:%',kind; END IF;
  r:=public.set_automatic_play(g,rd,gen_random_uuid(),p,v,true);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,true);
  IF r->>'outcome'<>'accepted' OR NOT (r->'player'->>'auto_fold')::boolean THEN RAISE EXCEPTION 'proof:enable:%:%',kind,r; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_intent'; END IF;
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:disable:%',kind; END IF;
  IF kind IN ('horses','ship-captain-crew') THEN
   IF NOT (r->>'deferred')::boolean OR NOT (r->'player'->>'auto_fold')::boolean OR (r->'player'->>'auto_play_stop_round_id')::uuid<>rd THEN RAISE EXCEPTION 'proof:deferred_request'; END IF;
   -- Duplicate old disable cannot override a newer deliberate enable.
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:queue_version'; END IF;
   EXECUTE 'RESET ROLE';
   -- No connected browser action: server turn advance alone consumes the intent.
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(peer::text)) WHERE id=rd;
   IF (SELECT auto_fold OR auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:disconnect_stop_lost'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
  ELSIF (r->'player'->>'auto_fold')::boolean OR (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:immediate_stop:%',kind;
  END IF;
  EXECUTE 'RESET ROLE';
  IF kind IN ('horses','ship-captain-crew') THEN
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(p::text)) WHERE id=rd;
   UPDATE public.games SET is_paused=true WHERE id=g;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF NOT (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:paused_stop'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   IF r->'player'->>'auto_play_stop_round_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:enable_did_not_cancel_stop'; END IF;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_stop_overrode_enable'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   EXECUTE 'RESET ROLE';
   -- A delayed old-round completion must never disable automation in a new dealer game.
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
   UPDATE public.games SET is_paused=false WHERE id=g;
   UPDATE public.games SET current_game_uuid=dg WHERE id=g;
   UPDATE public.rounds SET status='completed' WHERE id=rd;
   IF NOT (SELECT auto_fold FROM public.players WHERE id=p) OR
    (SELECT auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:cross_identity_stop'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:completed_round_toggle'; END IF;
   EXECUTE 'RESET ROLE';
  END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:money_changed'; END IF;
  IF coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak'; END IF;
 END LOOP;
 -- Preference arguments cannot bypass the mutually exclusive server intent.
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.submit_ante_decision(g,dg,p,'ante_up',true,true); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:conflicting_ante_preferences'; END IF;
 EXECUTE 'RESET ROLE';
 IF has_table_privilege('authenticated','public.players','UPDATE') OR has_table_privilege('authenticated','public.games','INSERT')
 OR has_column_privilege('authenticated','public.players','chips','UPDATE')
 OR has_column_privilege('authenticated','public.players','auto_play_stop_round_id','UPDATE')
 THEN RAISE EXCEPTION 'proof:privilege_closure'; END IF;
END $proof$;
ROLLBACK;
