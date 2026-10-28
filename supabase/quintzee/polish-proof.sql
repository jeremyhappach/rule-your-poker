-- Transaction-contained local v2 delta proof, including actual canonical settlement.
DO $$ DECLARE b jsonb;v jsonb;s jsonb;f jsonb;g uuid;d uuid;actor uuid;req uuid;before jsonb;after_s jsonb;rev bigint;deadline bigint;v_run uuid;u uuid;other_id uuid;p_active uuid;i integer; BEGIN
 b:=private.quintzee_v2_board_start(private.quintzee_v2_rules(),1000);
 PERFORM pg_temp.quintzee_assert(b->>'phase'='ready' AND b->'dice'='[]' AND NOT b ? 'startedAt' AND (b->>'deadline')::bigint=31000,'blank ready, separate fixed 30s deadline');
 PERFORM pg_temp.quintzee_assert(private.quintzee_v2_board_reduce(b,'tick',NULL,30000)=b,'recovery before deadline cannot roll or extend');
 b:=private.quintzee_v2_board_reduce(b,'start','{}',15000);
 PERFORM pg_temp.quintzee_assert(b->>'phase'='playing' AND (b->>'startedAt')::bigint=15000 AND (b->>'deadline')::bigint=195000 AND (b->>'rollSerial')::int=1,'accepted start begins full gameplay clock and exactly one roll');
 BEGIN PERFORM private.quintzee_v2_board_reduce(b,'start','{}',15001);RAISE EXCEPTION 'duplicate start changed game';EXCEPTION WHEN OTHERS THEN IF SQLERRM='duplicate start changed game' THEN RAISE;END IF;END;
 b:=b||'{"dice":[2,2,3,4,5],"potentials":{"chance":16},"rollsRemaining":0}'::jsonb;deadline:=(b->>'deadline')::bigint;
 BEGIN PERFORM private.quintzee_v2_board_reduce(b,'score','{0}',15001);RAISE EXCEPTION 'zero without confirmation accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM='zero without confirmation accepted' THEN RAISE;END IF;END;
 v:=private.quintzee_v2_board_reduce(b,'score_zero','{0}',15001);
 PERFORM pg_temp.quintzee_assert(v#>>'{scores,ones}'='0' AND v->>'phase'='playing' AND v->>'deadline'=b->>'deadline' AND (v->>'rollSerial')::int=2,'confirmed zero and next category keep same gameplay clock');
 s:=jsonb_build_object('core',jsonb_build_object('board',b));PERFORM pg_temp.quintzee_assert(private.quintzee_bot_choice(s,15001)->>'action'='score','bot chooses positive visible scoring');
 b:=b||'{"potentials":{}}'::jsonb;s:=jsonb_build_object('core',jsonb_build_object('board',b));PERFORM pg_temp.quintzee_assert(private.quintzee_bot_choice(s,15001)->>'action'='score_zero','bot can intentionally fill zero');
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT p.id,p.user_id INTO p_active,actor FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE m.dealer_game_id=d;
 SELECT state,revision INTO before,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.quintzee_assert(before->>'phase'='ready' AND before#>>'{rules,version}'='quintzee/2','multiplayer admits new rules and waits');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);v:=public.quintzee_snapshot(d);
 PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d),'reconnect cannot extend ready deadline');
 req:=gen_random_uuid();v:=public.quintzee_action(d,req,rev,'start','{}');SELECT state,revision INTO after_s,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM public.quintzee_action(d,req,rev-1,'start','{}');PERFORM pg_temp.quintzee_assert((SELECT state=after_s AND revision=rev FROM private.quintzee_matches WHERE dealer_game_id=d),'duplicate request rolls once');
 BEGIN PERFORM public.quintzee_action(d,gen_random_uuid(),rev-1,'score_zero','{0}');RAISE EXCEPTION 'stale confirmation accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:stale_revision' THEN RAISE;END IF;END;
 -- Fake human first-action expiry takes over through canonical flags; reclaim never restarts clock.
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT p.id,p.user_id INTO p_active,actor FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE m.dealer_game_id=d;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))) WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();SELECT state,revision INTO before,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.quintzee_assert(before->>'phase'='playing' AND (SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=p_active),'fake timeout commits canonical takeover and first roll');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM public.quintzee_reclaim(d,rev);PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d),'reclaim cannot alter gameplay deadline/dice');
 -- All-away admitted matches continue legally; deliberate pauses still freeze.
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;
 SELECT (state->'players'->(state->>'turnIndex')::int->>'id')::uuid INTO p_active FROM private.quintzee_matches WHERE dealer_game_id=d;UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g AND id<>p_active;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))) WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();PERFORM pg_temp.quintzee_assert((SELECT NOT is_paused FROM public.games WHERE id=g) AND (SELECT state->>'phase'='playing' AND state#>>'{core,board,rollSerial}'='1' FROM private.quintzee_matches WHERE dealer_game_id=d),'all-away timeout starts legal autoplay without pausing');

 -- Deliberate pause is honored, and reclaim while paused does not resume or renew.
 UPDATE public.games SET is_paused=true WHERE id=g;SELECT state,revision INTO before,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d),'explicit pause freezes recovery');
 SELECT user_id INTO actor FROM public.players WHERE id=p_active;PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM public.quintzee_reclaim(d,rev);
 PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d) AND (SELECT is_paused FROM public.games WHERE id=g),'paused reclaim preserves clock and explicit pause');
 UPDATE public.games SET is_paused=false WHERE id=g;UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
 -- Only fixture scheduling times are accelerated; each action uses the legal reducer and actual recovery owner.
 FOR i IN 1..150 LOOP
  EXIT WHEN (SELECT settlement IS NOT NULL FROM private.quintzee_matches WHERE dealer_game_id=d);
  SELECT state INTO before FROM private.quintzee_matches WHERE dealer_game_id=d;
  IF before->>'phase'='stage_complete' THEN UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))) WHERE dealer_game_id=d;END IF;
  ALTER TABLE private.quintzee_matches DISABLE TRIGGER quintzee_bot_schedule;
  UPDATE private.quintzee_matches SET bot_due_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1 WHERE dealer_game_id=d;
  ALTER TABLE private.quintzee_matches ENABLE TRIGGER quintzee_bot_schedule;
  PERFORM private.quintzee_recover();
 END LOOP;
 PERFORM pg_temp.quintzee_assert((SELECT settlement IS NOT NULL FROM private.quintzee_matches WHERE dealer_game_id=d) AND (SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'all-away legal autoplay reaches canonical settlement');
 BEGIN PERFORM pg_temp.quintzee_fixture(2,false,'modern',true);RAISE EXCEPTION 'missing real money block';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'quintzee:fake_money_only' THEN RAISE;END IF;END;
 -- Solo admission freezes chosen cosmetic theme; missing Start expires unranked.
 u:=(f#>>'{users,0}')::uuid;UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 req:=gen_random_uuid();v:=public.arcade_quintzee_start(u,req,'modern');v_run:=(v->>'id')::uuid;v:=public.arcade_quintzee_step(u,v_run);before:=v;
 PERFORM pg_temp.quintzee_assert(v#>>'{projection,view,phase}'='ready' AND v#>>'{record,config,theme}'='modern','solo is blank with requested theme');
 v:=public.arcade_quintzee_start(u,req,'classic');PERFORM pg_temp.quintzee_assert(v#>>'{config,theme}'='modern','start retry cannot replace frozen theme');
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE id=v_run;
 v:=public.arcade_quintzee_step(u,v_run);PERFORM pg_temp.quintzee_assert(v#>>'{record,status}'='expired' AND NOT EXISTS(SELECT 1 FROM private.arcade_results WHERE run_id=v_run),'solo first-action expiry unranked');
END $$;
DO $$ DECLARE f jsonb;g uuid;d uuid;n integer;k integer;ids uuid[];totals jsonb;expected jsonb;i integer;BEGIN
 FOR n IN 2..4 LOOP FOR k IN 1..n LOOP
 f:=pg_temp.quintzee_fixture(n);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(f->'players');totals:='{}';FOR i IN 1..n LOOP totals:=totals||jsonb_build_object(ids[i]::text,CASE WHEN i<=k THEN 100 ELSE 0 END);END LOOP;
 expected:=private.split_whole_chips_clockwise(g,ids[1:k],(n-k)*5,n);UPDATE private.quintzee_matches SET state=state||jsonb_build_object('phase','complete','scores',totals) WHERE dealer_game_id=d;PERFORM private.quintzee_settle(d);PERFORM private.quintzee_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
 FOR i IN 1..n LOOP PERFORM pg_temp.quintzee_assert((SELECT chips=100+CASE WHEN i<=k THEN coalesce((expected->>ids[i]::text)::int,0) ELSE -5 END FROM public.players WHERE id=ids[i]),'v2 canonical winner/tie amounts');END LOOP;
 PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'v2 exactly-once result');SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;
END $$;

DO $$ DECLARE f jsonb;d uuid;BEGIN
 f:=pg_temp.quintzee_fixture(3,true);d:=(f->>'dealer')::uuid;
 PERFORM pg_temp.quintzee_assert((SELECT state->>'phase'='ready' AND bot_due_at IS NOT NULL FROM private.quintzee_matches WHERE dealer_game_id=d),'real bot ready turn is scheduled');
 ALTER TABLE private.quintzee_matches DISABLE TRIGGER quintzee_bot_schedule;UPDATE private.quintzee_matches SET bot_due_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1 WHERE dealer_game_id=d;ALTER TABLE private.quintzee_matches ENABLE TRIGGER quintzee_bot_schedule;
 PERFORM private.quintzee_recover();PERFORM pg_temp.quintzee_assert((SELECT state->>'phase'='playing' AND state#>>'{core,board,rollSerial}'='1' FROM private.quintzee_matches WHERE dealer_game_id=d),'real bot starts once through recovery');
END $$;

-- Admit a synthetic historical /1 fixture through its original rule selection, then restore /2 admission.
DO $$ DECLARE source text;f jsonb;d uuid;actor uuid;v jsonb;rev bigint;req uuid:=gen_random_uuid();saved jsonb;BEGIN
 source:=pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure);
 EXECUTE replace(source,'private.quintzee_v2_rules()','private.quintzee_v1_rules()');f:=pg_temp.quintzee_fixture(2);EXECUTE source;d:=(f->>'dealer')::uuid;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_reduce(state,'tick',NULL,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=d;
 SELECT p.user_id,m.revision INTO actor,rev FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE m.dealer_game_id=d;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM public.quintzee_action(d,req,rev,'roll','{}');SELECT state INTO saved FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM public.quintzee_action(d,req,rev,'roll','{}');PERFORM pg_temp.quintzee_assert((SELECT state=saved AND state#>>'{rules,version}'='quintzee/1' FROM private.quintzee_matches WHERE dealer_game_id=d),'historical /1 action replay retains frozen behavior');
END $$;
DO $$ DECLARE b jsonb;v jsonb;BEGIN
 b:=private.quintzee_v2_board_start(private.quintzee_v2_rules(),1000)||'{"phase":"playing","scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}}'::jsonb;
 v:=private.quintzee_present_board(b);PERFORM pg_temp.quintzee_assert(v->>'baseScore'='98' AND v->>'upperBonusAwarded'='35' AND (v-'baseScore'-'upperBonusAwarded')=b,'projection uses frozen scoring and changes no authoritative board fields');
 b:=jsonb_set(b,'{scores,yahtzee}','50');v:=private.quintzee_present_board(b);PERFORM pg_temp.quintzee_assert(v->>'baseScore'='148' AND v->>'upperBonusAwarded'='35','Quintzee is the recorded 50, not another bonus award');
 b:=private.quintzee_v1_board_start(private.quintzee_v1_rules(),1000)||'{"phase":"playing","scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}}'::jsonb;
 PERFORM pg_temp.quintzee_assert(private.quintzee_present_board(b)->>'baseScore'='98','historical version uses its own frozen scorer');
 PERFORM pg_temp.quintzee_assert(NOT has_function_privilege('authenticated','private.quintzee_present_board(jsonb)','execute'),'private scorer projection is not a public RPC');
END $$;
