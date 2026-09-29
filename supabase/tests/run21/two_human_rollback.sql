-- Generator substitutes __ENGINE_STATES__; caller wraps candidate + proof in BEGIN/ROLLBACK.
CREATE FUNCTION pg_temp.check_run21(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'run21_two_human_proof:%',label; END IF; END $$;
DO $proof$
DECLARE users uuid[]; g uuid; p uuid; q uuid; dg uuid; r uuid; deadline timestamptz;
 result jsonb; replay jsonb; original jsonb; candidate jsonb; scenario jsonb; snapshot jsonb; journal jsonb;
 rev bigint; chosen text; bot boolean; terminal boolean; dealer uuid; dealer_user uuid; pos integer; old_dg uuid;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users au ON au.id=pr.id WHERE pr.is_active ORDER BY pr.id LIMIT 3) u;
 PERFORM pg_temp.check_run21(cardinality(users)=3,'auth_fixtures');
 PERFORM pg_temp.check_run21(NOT has_function_privilege('authenticated','public.run21_server_commit_admitted(uuid,uuid,bigint,jsonb,bigint)','execute'),'service_only_commit');
 PERFORM pg_temp.check_run21(NOT has_function_privilege('anon','public.run21_configure_local(uuid,uuid,integer,text,jsonb,timestamptz)','execute'),'no_anonymous_setup');
 INSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":true}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 FOR scenario IN SELECT value FROM jsonb_array_elements('__ENGINE_STATES__'::jsonb) LOOP
  chosen:=scenario->>'harness';bot:=(scenario->>'bot')::boolean;terminal:=(scenario->>'terminal')::boolean;
  deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(name,current_host,real_money,status,dealer_position,config_deadline)
   VALUES('Rollback Run21 two-human proof',users[1],false,'configuring',1,deadline) RETURNING id INTO g;
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,is_bot)
   VALUES(g,users[1],1,0,'active',false,false,false) RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,is_bot)
   VALUES(g,users[2],4,0,'active',false,false,bot) RETURNING id INTO q;
  UPDATE public.game_defaults SET debug_harness=chosen WHERE game_type='run21';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  UPDATE public.players SET sitting_out=true WHERE id=q;
  BEGIN
   PERFORM public.run21_configure_local(g,p,1,'run21','{"ante_amount":5}',deadline);RAISE EXCEPTION 'proof:one_player_allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:two_eligible_players_required' THEN RAISE; END IF; END;
  UPDATE public.players SET sitting_out=false WHERE id=q;
  INSERT INTO public.players(game_id,user_id,position,status,sitting_out,waiting) VALUES(g,users[3],6,'active',false,false);
  BEGIN
   PERFORM public.run21_configure_local(g,p,1,'run21','{"ante_amount":5}',deadline);RAISE EXCEPTION 'proof:three_players_allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:two_eligible_players_required' THEN RAISE; END IF; END;
  DELETE FROM public.players WHERE game_id=g AND user_id=users[3];
  BEGIN
   PERFORM public.run21_configure_local(g,q,4,'run21','{"ante_amount":5}',deadline);RAISE EXCEPTION 'proof:wrong_dealer_allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:setup_identity' THEN RAISE; END IF; END;
  BEGIN
   PERFORM public.run21_configure_local(g,p,1,'run21','{"ante_amount":0}',deadline);RAISE EXCEPTION 'proof:invalid_config_allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:invalid_setup' THEN RAISE; END IF; END;
  BEGIN
   PERFORM public.run21_configure_local(g,p,1,'run21','{"ante_amount":5}',deadline-interval '1 second');RAISE EXCEPTION 'proof:stale_setup_allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:setup_identity' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);
  BEGIN
   PERFORM public.run21_configure_local(g,p,1,'run21','{"ante_amount":5}',deadline);RAISE EXCEPTION 'proof:outsider_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  SET LOCAL ROLE authenticated;
  result:=public.run21_configure_local(g,p,1,'run21','{"ante_amount":5}',deadline);
  replay:=public.run21_configure_local(g,p,1,'run21','{"ante_amount":5}',deadline);
  RESET ROLE;
  dg:=(result#>>'{dealer_game,id}')::uuid;
  SELECT first_round_id INTO r FROM private.run21_matches WHERE dealer_game_id=dg;
  PERFORM pg_temp.check_run21(result->>'outcome'='configured' AND replay->>'deduped'='true','configure_duplicate_'||chosen||bot);
  PERFORM pg_temp.check_run21((SELECT debug_harness=chosen AND jsonb_array_length(participants)=2
   AND (SELECT count(*) FROM jsonb_array_elements(participants) x WHERE x->>'kind'='human')=CASE WHEN bot THEN 1 ELSE 2 END
   FROM private.run21_matches WHERE dealer_game_id=dg),'frozen_all_participants');
  UPDATE public.game_defaults SET debug_harness='none' WHERE game_type='run21';
  PERFORM pg_temp.check_run21((SELECT debug_harness=chosen FROM private.run21_matches WHERE dealer_game_id=dg),'frozen_after_global_change');
  rev:=0;journal:='[]';
  FOR snapshot IN SELECT value FROM jsonb_array_elements(scenario->'states') LOOP
   candidate:=replace(replace(replace(replace(replace(snapshot::text,
    '00000000-0000-4000-8000-00000000000a',g::text),
    '00000000-0000-4000-8000-00000000000b',dg::text),
    '00000000-0000-4000-8000-000000000014',r::text),
    '00000000-0000-4000-8000-000000000001',p::text),
    '00000000-0000-4000-8000-000000000002',q::text)::jsonb;
   journal:=journal||(candidate->'events');
   result:=public.run21_server_commit_admitted(users[1],dg,rev,candidate,NULL);
   PERFORM pg_temp.check_run21(result->>'outcome'='committed','real_engine_commit');rev:=rev+1;
  END LOOP;
  PERFORM pg_temp.check_run21((public.run21_server_commit_admitted(users[1],dg,0,candidate,NULL)->>'outcome')='conflict','stale_cas');
  original:=public.run21_server_load(g)->0;
  PERFORM pg_temp.check_run21(original#>'{state,events}'=journal,'history_replay_exact');
  PERFORM pg_temp.check_run21(public.run21_server_admit(users[3],g)->'record'='null'::jsonb,'outsider_no_match');
  BEGIN
   PERFORM public.run21_server_commit_admitted(users[3],dg,rev,candidate,NULL);RAISE EXCEPTION 'proof:outsider_commit';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF chosen='none' THEN CONTINUE; END IF;
  PERFORM pg_temp.check_run21((SELECT count(*)=1 FROM private.run21_settlements WHERE dealer_game_id=dg),'one_receipt');
  PERFORM pg_temp.check_run21((SELECT (balances->>(candidate->>'winnerId'))::numeric=5
   AND (balances->>(candidate#>>'{settlement,loserId}'))::numeric=-5 FROM private.run21_matches WHERE dealer_game_id=dg),'loser_pays_winner');
  result:=public.run21_server_commit_admitted(CASE WHEN bot THEN users[1] ELSE users[2] END,dg,rev,candidate,NULL);
  PERFORM pg_temp.check_run21(result->>'outcome'='committed','both_humans_admitted');
  PERFORM pg_temp.check_run21((SELECT count(*)=1 FROM private.run21_settlements WHERE dealer_game_id=dg),'replay_no_duplicate_settlement');
  IF terminal THEN UPDATE public.games SET pending_session_end=true WHERE id=g; END IF;
  PERFORM public.run21_server_close(dg,users[1]);PERFORM public.run21_server_close(dg,users[1]);
  PERFORM pg_temp.check_run21((SELECT finished FROM private.run21_matches WHERE dealer_game_id=dg),'close_dedup');
  PERFORM pg_temp.check_run21((SELECT status=CASE WHEN terminal THEN 'session_ended' ELSE 'game_selection' END
   AND current_game_uuid IS NULL FROM public.games WHERE id=g),'continuation_or_session_ended');
  PERFORM pg_temp.check_run21(NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=g),'fake_money_no_account_postings');
  IF NOT terminal THEN
   old_dg:=dg;SELECT config_deadline,dealer_position INTO deadline,pos FROM public.games WHERE id=g;
   SELECT id,user_id INTO dealer,dealer_user FROM public.players WHERE game_id=g AND position=pos;
   PERFORM set_config('request.jwt.claim.sub',dealer_user::text,true);
   result:=public.run21_configure_local(g,dealer,pos,'run21','{"ante_amount":5}',deadline);
   PERFORM pg_temp.check_run21((result#>>'{dealer_game,id}')::uuid<>old_dg,'next_match_after_settlement');
  END IF;
 END LOOP;
END $proof$;
SELECT 'Run21 two-human setup, harness, tie, winner, settlement, history, replay, stale, unauthorized, continuation and Session Ended proof passed' AS proof;
