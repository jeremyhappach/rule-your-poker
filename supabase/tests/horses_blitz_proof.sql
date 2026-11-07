BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='25s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.hb_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Horses Blitz proof: %',label;END IF;END$$;
DO $$
DECLARE item record;r jsonb;s jsonb;t jsonb;i integer;j integer;at_ms bigint:=1000000;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('[1,4,4,2,6]',1,390,3),('[1,4,4,2,6]',2,225,3),('[1,4,4,2,6]',3,90,3),
 ('[1,1,1,1,1]',1,1400,5),('[1,1,4,4,4]',2,1000,5),('[1,1,4,4,2]',3,250,4),
 ('[2,3,4,5,6]',3,0,1),('[1,2,2,3,3]',1,390,3),('[1,1,2,3,4]',1,390,3),
 ('[6,6,6,6,6]',3,650,5),('[4,4,4,4,2]',1,600,4),('[4,4,4,4,2]',2,400,4)
 )x(dice,roll,points,size) LOOP
 r:=private.horses_blitz_set(item.dice::jsonb,item.roll);
 PERFORM pg_temp.hb_check((r->>'points')::int=item.points AND (r->>'size')::int=item.size,'ladder and wilds '||item.dice||' roll '||item.roll);
 END LOOP;
 s:=private.horses_blitz_round(jsonb_build_object('runId',gen_random_uuid(),'userId',gen_random_uuid(),'config',private.horses_blitz_rules(),'status','active','score',0,'round',0,'results','[]'::jsonb),at_ms);
 s:=s||'{"dice":[1,4,4,2,6],"set":{"size":3,"points":390,"label":"Three of a kind"}}';
 t:=private.horses_blitz_action(s,'roll',ARRAY[0,1,2,3,4],at_ms+1);
 PERFORM pg_temp.hb_check(t->'dice'=s->'dice' AND t#>>'{set,points}'='225','held triple miss second roll');
 t:=private.horses_blitz_action(t,'roll',ARRAY[0,1,2,3,4],at_ms+2);
 PERFORM pg_temp.hb_check(t->>'phase'='banking' AND t->>'base'='90' AND jsonb_array_length(t->'hands')=1,'third roll auto banks 90');
 PERFORM pg_temp.hb_check(private.horses_blitz_advance(t,at_ms+451)->>'hand'='1','bank beat holds identity');
 t:=private.horses_blitz_advance(t,at_ms+452);
 PERFORM pg_temp.hb_check(t->>'hand'='2' AND t->>'roll'='1' AND t->'held'='[]'::jsonb,'fresh hand clears holds');
 s:=s||'{"dice":[2,3,4,5,6],"set":{"points":0,"size":1,"label":"No scoring set"}}';
 BEGIN PERFORM private.horses_blitz_action(s,'bank','{}',at_ms);RAISE EXCEPTION 'zero bank allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%illegal_action%' THEN RAISE;END IF;END;
 s:=private.horses_blitz_action(s,'roll',ARRAY[0,1,2,3,4],at_ms);
 s:=private.horses_blitz_action(s,'roll',ARRAY[0,1,2,3,4],at_ms);
 PERFORM pg_temp.hb_check(s->>'base'='0' AND s->>'phase'='banking','zero third roll ends hand');
 t:=private.horses_blitz_finish(t,at_ms+100000,'timeout');
 PERFORM pg_temp.hb_check(t#>>'{result,base}'='90' AND t#>>'{result,timerBonus}'='0' AND jsonb_array_length(t#>'{result,hands}')=10,'timeout keeps banked points only');
 PERFORM pg_temp.hb_check(private.horses_blitz_advance(t,at_ms+9999999)=t,'summary never auto skips');
 FOR i IN 1..100 LOOP
  r:=private.horses_blitz_roll('[1,4,4,2,6]',ARRAY[0,1,2]);
  PERFORM pg_temp.hb_check(r->0='1' AND r->1='4' AND r->2='4' AND jsonb_array_length(r)=5,'hold preservation');
 END LOOP;
 FOR j IN 1..3 LOOP
  s:=private.horses_blitz_round(jsonb_build_object('runId',gen_random_uuid(),'config',private.horses_blitz_rules(),'status','active','score',0,'round',0,'results','[]'::jsonb),at_ms);
  FOR i IN 1..10 LOOP
   s:=s||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',1));
   s:=private.horses_blitz_action(s,'bank','{}',at_ms+i*500);
   IF i<10 THEN s:=private.horses_blitz_advance(s,at_ms+i*500+450);END IF;
  END LOOP;
  s:=private.horses_blitz_finish(s,at_ms+(ARRAY[50000,99999,100000])[j],CASE WHEN j=3 THEN 'timeout' ELSE 'complete' END);
  PERFORM pg_temp.hb_check((s#>>'{result,timerBonus}')::int=(ARRAY[2500,0,0])[j],'timer boundary');
 END LOOP;
END$$;
DO $$
DECLARE actor uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();request uuid:=gen_random_uuid();run jsonb;run2 jsonb;
 v jsonb;before_v jsonb;response jsonb;rid uuid;round_i integer;hand_i integer;i integer;terminal_request uuid;final_before jsonb;recovery_token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(stranger);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true),(stranger,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'HB proof A',true),(stranger,'HB proof B',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=null;
 BEGIN PERFORM public.arcade_start(actor,request,'horses-blitz');RAISE EXCEPTION 'closed admission accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;END;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='horses-blitz/1';
 run:=public.arcade_start(actor,request,'horses-blitz');rid:=(run->>'id')::uuid;
 PERFORM pg_temp.hb_check(public.arcade_start(actor,request,'horses-blitz')->>'id'=run->>'id','duplicate start');
 PERFORM pg_temp.hb_check(public.arcade_start(actor,gen_random_uuid(),'horses-blitz')->>'id'=run->>'id','one active run');
 BEGIN PERFORM public.arcade_horses_blitz_step(stranger,rid);RAISE EXCEPTION 'wrong owner';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_horses_blitz_step(NULL,rid);RAISE EXCEPTION 'wrong worker';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.hb_check(NOT has_function_privilege('authenticated','public.arcade_horses_blitz_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','execute'),'service only');
 v:=public.arcade_horses_blitz_step(actor,rid)->'projection';
 PERFORM pg_temp.hb_check(NOT v ?| ARRAY['deck','seed','config'],'private randomness');
 CREATE TEMP TABLE hb_write_baseline ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables WHERE schemaname IN('public','private') AND relname NOT LIKE 'arcade_%';
 before_v:=v;request:=gen_random_uuid();
 response:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'roll',ARRAY[0,1,2,3,4]);v:=response->'projection';
 PERFORM pg_temp.hb_check(response->>'outcome'='committed' AND v->>'roll'='2','roll once');
 PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'roll',ARRAY[0,1,2,3,4])->>'outcome'='duplicate','duplicate request');
 BEGIN PERFORM public.arcade_horses_blitz_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'roll','{}');RAISE EXCEPTION 'changed replay';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%request_conflict%' THEN RAISE;END IF;END;
 PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',gen_random_uuid(),'roll','{}')->>'outcome'='stale','stale revision');
 FOR round_i IN 1..3 LOOP
  FOR hand_i IN 1..10 LOOP
   UPDATE private.arcade_runs SET state=state||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',(state->>'roll')::int)) WHERE id=rid;
   v:=public.arcade_horses_blitz_step(actor,rid)->'projection';before_v:=v;request:=gen_random_uuid();
   v:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'bank','{}')->'projection';
   PERFORM pg_temp.hb_check(v->>'phase'='banking' AND v->>'hand'=hand_i::text,'bank one hand');
   PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',gen_random_uuid(),'bank','{}')->>'outcome'='stale','burst bank cannot advance');
   UPDATE private.arcade_runs SET state=jsonb_set(state,'{phaseUntil}','0') WHERE id=rid;
   IF round_i=3 AND hand_i=10 THEN
    CREATE FUNCTION pg_temp.hb_fail() RETURNS trigger LANGUAGE plpgsql AS $g$BEGIN RAISE EXCEPTION 'injected HB result failure';END$g$;
    CREATE TRIGGER hb_atomic BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.hb_fail();
    BEGIN PERFORM public.arcade_horses_blitz_step(actor,rid);RAISE EXCEPTION 'fault missing';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected HB%' THEN RAISE;END IF;END;
    PERFORM pg_temp.hb_check(NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=rid) AND (SELECT state->>'phase' FROM private.arcade_runs WHERE id=rid)='banking','atomic finalization rollback');
    DROP TRIGGER hb_atomic ON private.arcade_results;terminal_request:=request;final_before:=before_v;
   END IF;
   v:=public.arcade_horses_blitz_step(actor,rid)->'projection';
  END LOOP;
  PERFORM pg_temp.hb_check(v->>'phase'='summary' AND v->>'round'=round_i::text,'round summary');
  PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(actor,rid)->'projection'->>'round'=round_i::text,'read retains summary');
  IF round_i<3 THEN
   before_v:=v;request:=gen_random_uuid();
   v:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'next_round','{}')->'projection';
   PERFORM pg_temp.hb_check(v->>'hand'='1' AND v->>'roll'='1' AND v->'held'='[]'::jsonb,'next round fresh');
   PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'next_round','{}')->>'outcome'='duplicate','next round replay');
  END IF;
 END LOOP;
 PERFORM pg_temp.hb_check(v->>'status'='completed' AND (SELECT count(*) FROM private.arcade_results WHERE run_id=rid)=1,'one verified result');
 PERFORM pg_temp.hb_check((SELECT private.horses_blitz_valid(state) AND NOT private.horses_blitz_valid(jsonb_set(state,'{score}','999999')) FROM private.arcade_runs WHERE id=rid),'completion integrity');
 run2:=public.arcade_start(actor,gen_random_uuid(),'horses-blitz');
 PERFORM pg_temp.hb_check(run2->>'id'<>run->>'id','successor');
 PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(actor,rid,(final_before->>'revision')::bigint,final_before->>'roundId',terminal_request,'bank','{}')->>'outcome'='duplicate','late replay');
 rid:=(run2->>'id')::uuid;v:=public.arcade_horses_blitz_step(actor,rid)->'projection';
 v:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}')->'projection';
 PERFORM pg_temp.hb_check(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=rid),'abandon unranked');
 run2:=public.arcade_start(actor,gen_random_uuid(),'horses-blitz');rid:=(run2->>'id')::uuid;
 UPDATE private.arcade_recovery_state SET claimed=true,token=recovery_token,expires_at=clock_timestamp()+interval '1 minute' WHERE singleton;
 v:=public.arcade_horses_blitz_step(actor,rid)->'projection';
 FOR i IN 1..3 LOOP
  UPDATE private.arcade_runs SET state=state||'{"deadline":100000,"startedAt":0}'::jsonb,due_at=0 WHERE id=rid;
  v:=public.arcade_horses_blitz_step(NULL,rid,p_token=>recovery_token)->'projection';
  PERFORM pg_temp.hb_check(v->>'phase'='summary' AND v->>'score'='0','zero client timeout');
  PERFORM pg_temp.hb_check(public.arcade_horses_blitz_step(NULL,rid,p_token=>recovery_token)->'projection'->>'round'=i::text,'worker leaves summary');
  IF i<3 THEN v:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'next_round','{}')->'projection';END IF;
 END LOOP;
 PERFORM pg_temp.hb_check((SELECT count(*) FROM private.arcade_results WHERE run_id=rid)=1,'worker terminal result');
 run2:=public.arcade_start(stranger,gen_random_uuid(),'horses-blitz');rid:=(run2->>'id')::uuid;
 v:=public.arcade_horses_blitz_step(stranger,rid)->'projection';
 FOR i IN 1..3 LOOP
  UPDATE private.arcade_runs SET state=state||'{"deadline":100000,"startedAt":0}'::jsonb,due_at=0 WHERE id=rid;
  v:=public.arcade_horses_blitz_step(NULL,rid,p_token=>recovery_token)->'projection';
  IF i<3 THEN v:=public.arcade_horses_blitz_step(stranger,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'next_round','{}')->'projection';END IF;
 END LOOP;
 response:=public.arcade_leaderboard(actor,'horses-blitz','all');
 PERFORM pg_temp.hb_check(jsonb_array_length(response->'rows')=3 AND jsonb_array_length(public.arcade_leaderboard(actor,'horses-blitz','30')->'rows')=3,'leaderboards');
 PERFORM pg_temp.hb_check((SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(response->'rows')x WHERE x->>'score'='0')=1,'tied scores share rank');
 PERFORM pg_temp.hb_check(NOT EXISTS(SELECT FROM hb_write_baseline b JOIN pg_stat_xact_user_tables t USING(relid) WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>b.n),'zero multiplayer and financial writes');
END$$;
SELECT 'PASS: Horses Blitz rules, replay, auth, recovery, continuation, terminal and isolation' result;
SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) authority_digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname LIKE 'horses_blitz_%') OR (n.nspname='public' AND p.proname='arcade_horses_blitz_step');
ROLLBACK;
