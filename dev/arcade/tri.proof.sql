-- Run only inside BEGIN/ROLLBACK. No test row survives.
CREATE FUNCTION pg_temp.tri_assert_no_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Solo wrote non-Arcade authority %',TG_TABLE_NAME;END$$;
CREATE FUNCTION pg_temp.tri_fail_result() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'tri injected result failure';END$$;
CREATE FUNCTION pg_temp.tri_run(actor uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 r:=public.arcade_start(actor,gen_random_uuid(),'tri-towers');
 RETURN public.arcade_tri_step(actor,(r->>'id')::uuid)->'record';
END $$;
-- Feed a server-owned cumulative chain through the actual immutable result writer.
CREATE FUNCTION pg_temp.tri_finish(actor uuid,points bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;s jsonb;b jsonb;
BEGIN
 r:=pg_temp.tri_run(actor);s:=r->'state';
 b:=private.tri_towers_board_finish_v2(jsonb_set(s->'board','{score}',to_jsonb(points)),'timeout',1000);
 s:=private.arcade_tri_finish_round(jsonb_set(s,'{board}',b));
 s:=private.arcade_tri_advance(s,6000);
 b:=private.tri_towers_board_finish_v2(s->'board','timeout',7000);s:=private.arcade_tri_finish_round(jsonb_set(s,'{board}',b));
 IF s->>'status'='active' THEN s:=private.arcade_tri_advance(s,12000);s:=private.arcade_tri_finish_round(jsonb_set(s,'{board}',private.tri_towers_board_finish_v2(s->'board','timeout',13000)));END IF;
 RETURN public.arcade_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,s,NULL)->'record';
END $$;
DO $$
DECLARE a uuid:=gen_random_uuid();other uuid:=gen_random_uuid();req uuid:=gen_random_uuid();run_id uuid;r jsonb;s jsonb;b jsonb;expected jsonb;
 projection jsonb;value_i jsonb;before_i bigint;i integer;points bigint;pair record;first_id uuid;token_i uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(other);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Solo Tri proof',true),(other,'Solo Tri foreign',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 -- Every non-Arcade authority table is guarded, including actual chips/ledger/session tables.
 FOR pair IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','private') AND tablename NOT LIKE 'arcade_%' ORDER BY schemaname,tablename LOOP
  EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE NOWAIT',pair.schemaname,pair.tablename);
  EXECUTE format('CREATE TRIGGER solo_tri_no_write BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.tri_assert_no_write()',pair.schemaname,pair.tablename);
 END LOOP;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 UPDATE private.arcade_rulesets SET enabled=false WHERE id='tri-towers/2';
 BEGIN PERFORM public.arcade_start(a,req,'tri-towers');RAISE EXCEPTION 'disabled admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'arcade:unavailable' THEN RAISE;END IF;END;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/2';
 r:=public.arcade_start(a,req,'tri-towers');run_id:=(r->>'id')::uuid;first_id:=run_id;
 ASSERT (public.arcade_start(a,req,'tri-towers')->>'id')::uuid=run_id,'start duplicate';
 ASSERT (public.arcade_start(a,gen_random_uuid(),'tri-towers')->>'id')::uuid=run_id,'one active run';
 r:=public.arcade_tri_step(a,run_id);projection:=r->'projection';r:=r->'record';s:=r->'state';
 ASSERT s->'config'=private.tri_towers_rules(),'exact shared config';
 ASSERT NOT (projection->'view') ? 'deck' AND NOT (projection->'view') ? 'players','private board isolation';
 ASSERT jsonb_array_length(projection#>'{view,cards}')=28 AND projection#>'{view,cards,0}'='null'::jsonb AND (projection#>>'{view,stockRemaining}')::integer=23,'redaction and stock';
 BEGIN PERFORM public.arcade_tri_step(other,run_id);RAISE EXCEPTION 'foreign admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_tri_step(NULL,run_id);RAISE EXCEPTION 'worker admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_tri_step(a,run_id,(r->>'revision')::bigint,s->>'roundId',gen_random_uuid(),'remove',0);RAISE EXCEPTION 'hidden admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri_towers:illegal_move' THEN RAISE;END IF;END;
 ASSERT (public.arcade_load(a,run_id)->'state')=s,'invalid action does not start';
 req:=gen_random_uuid();value_i:=public.arcade_tri_step(a,run_id,(r->>'revision')::bigint,s->>'roundId',req,'draw');
 b:=value_i#>'{record,state,board}';
 ASSERT b->>'phase'='playing' AND (b->>'deadline')::bigint-(value_i#>>'{projection,serverAt}')::bigint=120000,'full atomic clock';
 expected:=private.tri_towers_board_reduce_v2(s->'board','draw',NULL,(value_i#>>'{projection,serverAt}')::bigint);
 ASSERT b=expected,'adapter core parity';
 ASSERT public.arcade_tri_step(a,run_id,(r->>'revision')::bigint,s->>'roundId',req,'draw')->>'outcome'='duplicate','action duplicate';
 BEGIN PERFORM public.arcade_tri_step(a,run_id,(r->>'revision')::bigint,s->>'roundId',req,'take_score');RAISE EXCEPTION 'mismatch admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'arcade:request_conflict' THEN RAISE;END IF;END;
 ASSERT public.arcade_tri_step(a,run_id,(r->>'revision')::bigint,s->>'roundId',gen_random_uuid(),'draw')->>'outcome'='stale','stale rejected';
 r:=value_i->'record';s:=r->'state';
 -- A delayed request commits expiry before rejecting its old round identity.
 s:=jsonb_set(s,'{board,deadline}',to_jsonb((value_i#>>'{projection,serverAt}')::bigint-40000));
 UPDATE private.arcade_runs SET state=s,due_at=(s#>>'{board,deadline}')::bigint WHERE id=run_id;
 value_i:=public.arcade_tri_step(a,run_id,(r->>'revision')::bigint,s->>'roundId',gen_random_uuid(),'draw');
 ASSERT value_i->>'outcome'='stale' AND value_i#>>'{record,status}'='completed','offline catchup all rounds';
 ASSERT jsonb_array_length(value_i#>'{record,state,results}')=2 AND (value_i#>>'{record,score}')::bigint=0,'round-only timeout';
 ASSERT (SELECT count(*) FROM private.arcade_results x WHERE x.run_id=first_id)=1,'one result';
 ASSERT public.arcade_tri_step(a,run_id)->'record'=value_i->'record','terminal replay';
 ASSERT public.arcade_start(a,(SELECT request_id FROM private.arcade_command_receipts x WHERE x.run_id=first_id AND fingerprint='start:tri-towers' LIMIT 1),'tri-towers')->>'id'=first_id::text,'late start replay';
 -- Cumulative totals are final values, never summed, including negative round deltas.
 FOREACH points IN ARRAY ARRAY[79999,80000,80001]::bigint[] LOOP
  r:=pg_temp.tri_finish(a,points);s:=r->'state';
  ASSERT (r->>'score')::bigint=points,'cumulative score was summed';
  ASSERT jsonb_array_length(s->'results')=CASE WHEN points>=80000 THEN 3 ELSE 2 END,'bonus boundary';
  ASSERT private.arcade_tri_advance(s,999999)=s,'no fourth round';
 END LOOP;
 r:=pg_temp.tri_finish(a,80001);ASSERT r#>>'{completion,kind}'='matched','tie classification';
 r:=pg_temp.tri_finish(a,79999);ASSERT r#>>'{completion,kind}'='lower','lower classification';
 r:=pg_temp.tri_finish(a,90000);ASSERT r#>>'{completion,kind}'='broken','new personal best';
 ASSERT (public.arcade_leaderboard(a,'tri-towers','all')->>'personalBest')::bigint=90000,'game board PB';
 ASSERT jsonb_array_length(public.arcade_leaderboard(a,'tri-towers','30')->'rows')>=6,'multiple scores per player';
 r:=pg_temp.tri_run(a);run_id:=(r->>'id')::uuid;s:=r->'state';
 s:=private.arcade_tri_advance(s,(s#>>'{board,deadline}')::bigint+40000);
 ASSERT private.arcade_tri_valid_completion(s),'valid zero timeout completion';
 ASSERT NOT private.arcade_tri_valid_completion(jsonb_set(s,'{score}','1')),'incorrect final score rejected';
 CREATE TRIGGER solo_tri_result_failure BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.tri_fail_result();
 before_i:=(r->>'revision')::bigint;
 BEGIN PERFORM public.arcade_commit(a,run_id,before_i,s,NULL);RAISE EXCEPTION 'failure not injected';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri injected result failure' THEN RAISE;END IF;END;
 ASSERT (SELECT revision FROM private.arcade_runs WHERE id=run_id)=before_i AND NOT EXISTS(SELECT 1 FROM private.arcade_results x WHERE x.run_id=(r->>'id')::uuid),'atomic rollback';
 DROP TRIGGER solo_tri_result_failure ON private.arcade_results;
 value_i:=public.arcade_tri_step(a,run_id,before_i,r#>>'{state,roundId}',gen_random_uuid(),'abandon');
 ASSERT value_i#>>'{record,status}'='abandoned' AND NOT EXISTS(SELECT 1 FROM private.arcade_results x WHERE x.run_id=(r->>'id')::uuid),'abandon unranked';
 -- Browser roles cannot call service authority or inspect private cards.
 ASSERT NOT has_function_privilege('authenticated','public.arcade_tri_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)','EXECUTE'),'authenticated execute denied';
 ASSERT NOT has_function_privilege('anon','public.arcade_tri_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)','EXECUTE'),'anon execute denied';
 ASSERT NOT has_table_privilege('authenticated','private.arcade_runs','SELECT'),'private state denied';
 -- Existing Run21 start and authority are still available in the same user account.
 ASSERT public.arcade_start(a,gen_random_uuid(),'run21')->>'game'='run21','Run21 start preserved';
END $$;
