BEGIN;
DO $proof$
DECLARE users uuid[]; g uuid; dg uuid; rd uuid; p uuid; peer uuid; kind text; ctx text; r jsonb; v bigint;
 denied boolean; before_round jsonb; before_game jsonb; deadline timestamptz; after_deadline timestamptz; duration numeric;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active
 AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 2) q;
 IF cardinality(users)<2 THEN RAISE EXCEPTION 'proof:auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  deadline:=clock_timestamp()+interval '1 minute';
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback pause '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,current_turn_position,decision_deadline,presentation_fallback_at,horses_state,yahtzee_state)
   VALUES(g,dg,1,1,0,'betting',1,CASE WHEN kind IN ('cribbage','gin-rummy') THEN NULL ELSE deadline END,deadline,
   CASE WHEN kind IN ('horses','ship-captain-crew') THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END,
   CASE WHEN kind='yahtzee' THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END) RETURNING id INTO rd;
  IF kind='gin-rummy' THEN
   INSERT INTO private.gin_rummy_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','playing','playerStates','{}'::jsonb,'scoringDueAt',deadline,'completeDueAt',deadline,'botActionDueAt',deadline,'actionCount',0));
  ELSIF kind='cribbage' THEN
   INSERT INTO private.cribbage_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','counting','playerStates','{}'::jsonb,'countingResolution',jsonb_build_object('presentationReleaseAt',deadline-interval '5 seconds','presentationFallbackAt',deadline)));
  END IF;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'proof:peer_pause:%',r; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'paused' OR (r->>'pause_version')::bigint<>1 THEN RAISE EXCEPTION 'proof:pause:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_pause_replay'; END IF;
  r:=public.set_game_paused(g,true,dg,1);
  IF r->>'outcome'<>'already_set' THEN RAISE EXCEPTION 'proof:identical_pause'; END IF;
  SELECT to_jsonb(x) INTO before_round FROM public.rounds x WHERE id=rd;
  -- Direct action requests must fail before consuming any legal turn.
  denied:=false;
  BEGIN
   CASE kind
    WHEN '3-5-7' THEN r:=public.three_five_seven_submit_decision(g,rd,dg,1,1,p,'stay');
    WHEN 'holm-game' THEN r:=public.holm_submit_decision(g,rd,p,'stay');
    WHEN 'horses' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'ship-captain-crew' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'yahtzee' THEN r:=public.yahtzee_apply_action(rd,p,'roll',NULL,NULL,NULL,0);
    WHEN 'cribbage' THEN r:=public.cribbage_apply_discard(rd,p,ARRAY[0]);
    WHEN 'gin-rummy' THEN r:=public.gin_rummy_apply_action(rd,p,'draw_stock',NULL,NULL,0);
   END CASE;
   denied:=r->>'outcome' IN ('paused','game_paused') OR r->>'reason' IN ('paused','game-paused','round_not_current') OR coalesce((r->>'game_paused')::boolean,false);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%paus%' THEN RAISE; END IF;
   denied:=true;
  END;
  IF NOT coalesce(denied,false) OR (SELECT to_jsonb(x) FROM public.rounds x WHERE id=rd) IS DISTINCT FROM before_round THEN RAISE EXCEPTION 'proof:paused_action_mutated:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,false,dg,0);
  IF r->>'outcome'<>'stale_identity' OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:stale_resume'; END IF;
  EXECUTE 'RESET ROLE';
  -- The owner-role fallback is also barred: service identity cannot skip pause.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  denied:=false; BEGIN UPDATE public.rounds SET pot=pot+1 WHERE id=rd; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_round_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.games SET total_hands=total_hands+1 WHERE id=g; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_game_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.players SET chips=chips+1 WHERE id=p; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_money_bypass'; END IF;
  -- Advance only the synthetic pause clock; no real waiting or shared setting.
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds' WHERE id=g;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,false,dg,1);
  IF r->>'outcome'<>'resumed' OR (r->>'pause_version')::bigint<>2 THEN RAISE EXCEPTION 'proof:resume:%:%',kind,r; END IF;
  duration:=(r->>'paused_duration_seconds')::numeric;
  SELECT presentation_fallback_at INTO after_deadline FROM public.rounds WHERE id=rd;
  IF abs(extract(epoch FROM(after_deadline-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:lease_shift:%',kind; END IF;
  IF kind IN ('cribbage','gin-rummy') AND (SELECT decision_deadline IS NOT NULL FROM public.rounds WHERE id=rd) THEN RAISE EXCEPTION 'proof:invented_human_timer'; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' OR (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:late_pause'; END IF;
  r:=public.set_game_paused(g,true,gen_random_uuid(),2);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  EXECUTE 'RESET ROLE';
  IF kind='gin-rummy' AND abs(extract(epoch FROM ((SELECT (state->>'botActionDueAt')::timestamptz FROM private.gin_rummy_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:gin_due_shift'; END IF;
  IF kind='cribbage' AND abs(extract(epoch FROM ((SELECT (state->'countingResolution'->>'presentationFallbackAt')::timestamptz FROM private.cribbage_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:cribbage_due_shift'; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g) THEN RAISE EXCEPTION 'proof:pause_financial_change'; END IF;
  FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
   IF coalesce(current_setting(ctx,true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak:%',ctx; END IF; END LOOP;
 END LOOP;

 -- Ending neutral paused setup remains a control request, not gameplay.
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(gen_random_uuid(),'Rollback paused end',true,1);
 g:=(r->>'game_id')::uuid;
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET status='game_selection',config_deadline=clock_timestamp()+interval '1 minute' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.set_game_paused(g,true,NULL,0);
 r:=public.request_session_end(g,NULL,(SELECT timer_generation FROM public.games WHERE id=g));
 IF r->>'terminal_disposition'<>'session_ended' THEN RAISE EXCEPTION 'proof:paused_control_end'; END IF;
 r:=public.set_game_paused(g,false,NULL,1);
 IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:ended_resume'; END IF;
 EXECUTE 'RESET ROLE';
END $proof$;
ROLLBACK;
