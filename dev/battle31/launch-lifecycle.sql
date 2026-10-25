DO $lifecycle$
DECLARE users uuid[]:=__USERS__; game uuid; dealer uuid; participant_ids uuid[]; deadline timestamptz; bot boolean; i int; n int; v jsonb; m private.battle31_matches; p public.players; failed boolean; d text; result_count int;
BEGIN
 UPDATE private.battle31_release SET enabled=true,admission_enabled=true,fake_qualified=true,real_qualified=false;
 failed:=false;BEGIN UPDATE private.battle31_release SET real_qualified=true;EXCEPTION WHEN check_violation THEN failed:=true;END;
 PERFORM pg_temp.b31_assert(failed,'real qualification cannot open');
 PERFORM pg_temp.b31_assert(to_regclass('private.battle31_access_grants') IS NULL AND to_regclass('private.battle31_admissions') IS NULL,'no named or expiring access machinery');
 -- Real-money capability and configure refuse even an otherwise valid caller/roster.
 game:=gen_random_uuid();participant_ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
 INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(game,users[1],'game_selection',true,2,deadline,0,false,false);
 FOR i IN 1..2 LOOP INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(participant_ids[i],game,users[i],3-i,100,false);END LOOP;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM pg_temp.b31_assert(NOT(public.battle31_capabilities(game)->>'enabled')::boolean,'real capability denied');
 failed:=false;BEGIN PERFORM public.battle31_configure(game,participant_ids[1],2,'battle-31','{"ante_amount":5}',deadline);EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='battle31:admission_closed';END;
 PERFORM pg_temp.b31_assert(failed,'real configure denied');EXECUTE 'RESET ROLE';
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=game),'real denial creates no offer');
 FOREACH bot IN ARRAY ARRAY[false,true] LOOP
 game:=gen_random_uuid();participant_ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
 INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,timeout_enforcement_enabled,timeout_action) VALUES(game,users[1],'game_selection',false,2,deadline,0,false,false,true,'auto_fold');
 FOR i IN 1..2 LOOP INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(participant_ids[i],game,users[i],3-i,100,bot AND i=2);END LOOP;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM pg_temp.b31_assert((public.battle31_capabilities(game)->>'enabled')::boolean,'fresh unrestricted identity allowed');
 EXECUTE 'RESET ROLE';
 UPDATE public.players SET sitting_out=true WHERE id=participant_ids[2];EXECUTE 'SET LOCAL ROLE authenticated';
 failed:=false;BEGIN PERFORM public.battle31_configure(game,participant_ids[1],2,'battle-31','{"ante_amount":5}',deadline);EXCEPTION WHEN OTHERS THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'one seat refused');EXECUTE 'RESET ROLE';
 UPDATE public.players SET sitting_out=false WHERE id=participant_ids[2];
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(gen_random_uuid(),game,users[3],3,100,false);
 EXECUTE 'SET LOCAL ROLE authenticated';failed:=false;BEGIN PERFORM public.battle31_configure(game,participant_ids[1],2,'battle-31','{"ante_amount":5}',deadline);EXCEPTION WHEN OTHERS THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'three seats refused');EXECUTE 'RESET ROLE';
 DELETE FROM public.players WHERE game_id=game AND user_id=users[3];
 EXECUTE 'SET LOCAL ROLE authenticated';
 v:=public.battle31_configure(game,participant_ids[1],2,'battle-31','{"ante_amount":5}',deadline);dealer:=(v#>>'{dealer_game,id}')::uuid;EXECUTE 'RESET ROLE';
 failed:=false;BEGIN UPDATE public.games SET real_money=true WHERE id=game;EXCEPTION WHEN check_violation THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'real-money switch denied');
 IF NOT bot THEN
 PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(game,dealer,participant_ids[2],'ante_up');EXECUTE 'RESET ROLE';END IF;
 PERFORM public.advance_ante_phase(game,dealer);
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=dealer;
 PERFORM pg_temp.b31_assert(jsonb_array_length(m.state->'players')=2,'exact two admitted');
 UPDATE public.games SET is_paused=true WHERE id=game;
 PERFORM pg_temp.b31_assert(private.pause_all_humans_auto_fold(game),'deliberate pause retained');
 UPDATE public.games SET is_paused=false WHERE id=game;
 -- Recovery executes the installed algorithm, restricted to the generated fixture.
 d:=pg_get_functiondef('private.battle31_recover()'::regprocedure);
 d:=replace(d,'WHERE NOT work.finished',format('WHERE work.game_id=%L::uuid AND NOT work.finished',game));EXECUTE d;
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=game AND NOT is_bot;
 PERFORM pg_temp.b31_assert(NOT private.pause_all_humans_auto_fold(game),'all-away active play money continues');
 SELECT * INTO p FROM public.players WHERE id=participant_ids[1];
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 v:=public.set_automatic_play(game,m.round_id,dealer,p.id,p.intent_version,false);EXECUTE 'RESET ROLE';
 PERFORM pg_temp.b31_assert(v->>'outcome'='accepted' AND NOT EXISTS(SELECT 1 FROM public.players WHERE id=p.id AND (auto_fold OR sit_out_next_hand)),'reclaim clears both flags');
 SELECT * INTO p FROM public.players WHERE id=participant_ids[1];
 EXECUTE 'SET LOCAL ROLE authenticated';v:=public.set_automatic_play(game,m.round_id,dealer,p.id,p.intent_version-1,false);EXECUTE 'RESET ROLE';PERFORM pg_temp.b31_assert(v->>'outcome'='stale_identity','stale reclaim denied');
 -- Drive one genuine expired human decision before returning both humans to automatic play.
 UPDATE private.battle31_matches SET state=state||'{"phase":"playing","turnIndex":1,"deadline":0}'::jsonb WHERE dealer_game_id=dealer;
 SELECT * INTO m FROM private.battle31_matches WHERE dealer_game_id=dealer;
 UPDATE public.players SET auto_fold=false,sit_out_next_hand=false WHERE id=(m.state#>>'{players,1,id}')::uuid AND NOT is_bot;
 PERFORM private.battle31_recover();
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM public.players WHERE id=(m.state#>>'{players,1,id}')::uuid AND NOT is_bot AND NOT auto_fold),'human expiry enables automatic play');
 UPDATE public.players SET auto_fold=true WHERE game_id=game AND NOT is_bot;
 FOR n IN 1..250 LOOP
 UPDATE private.battle31_matches SET state=jsonb_set(state,'{deadline}','0'),bot_due_at=0 WHERE dealer_game_id=dealer AND settlement IS NULL;
 PERFORM private.battle31_recover();
 SELECT * INTO m FROM private.battle31_matches WHERE dealer_game_id=dealer;
 EXIT WHEN m.settlement IS NOT NULL;
 END LOOP;
 PERFORM pg_temp.b31_assert(m.settlement IS NOT NULL,'autonomous match bounded and settled');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.b31_assert((SELECT sum(chips)=200 FROM public.players WHERE game_id=game),'canonical total conserved');
 PERFORM pg_temp.b31_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'autonomous immutable result');
 UPDATE private.battle31_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=dealer;PERFORM private.battle31_recover();PERFORM private.battle31_recover();
 PERFORM pg_temp.b31_assert((SELECT finished FROM private.battle31_matches WHERE dealer_game_id=dealer),'zero-client postgame complete');
 -- Undo only the fixture-specific recovery wrapper before the next topology.
 EXECUTE replace(d,format('WHERE work.game_id=%L::uuid AND NOT work.finished',game),'WHERE NOT work.finished');
 END LOOP;
END $lifecycle$;
