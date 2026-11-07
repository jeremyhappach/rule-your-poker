BEGIN;
SET LOCAL statement_timeout='25s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.check_voyage(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Voyage proof: %',label;END IF;END$$;
DO $$
DECLARE s jsonb;t jsonb;initial jsonb;i int;j int;n int;
BEGIN
 initial:=private.ship_cap_voyage_round(jsonb_build_object('runId',gen_random_uuid(),'config',private.ship_cap_voyage_rules(),'status','active','score',0,'round',0,'results','[]'::jsonb),1000);
 PERFORM pg_temp.check_voyage(initial->'dice'='[]'::jsonb AND initial->>'roll'='0','manual opening, no RNG');
 s:=private.ship_cap_voyage_apply_roll(initial,'[5,4,3,2,1]',1001);
 PERFORM pg_temp.check_voyage(s->'locked'='[]'::jsonb,'5 and 4 cannot precede 6');
 s:=private.ship_cap_voyage_apply_roll(s,'[6,2,2,2,2]',1002);
 PERFORM pg_temp.check_voyage(s->'locked'='[0]'::jsonb,'ship only');
 s:=private.ship_cap_voyage_apply_roll(s,'[6,5,2,2,2]',1003);
 PERFORM pg_temp.check_voyage(s->'locked'='[0,1]'::jsonb,'captain only');
 s:=private.ship_cap_voyage_apply_roll(s,'[6,5,4,5,6]',1004);
 PERFORM pg_temp.check_voyage(s->'locked'='[0,1,2]'::jsonb AND s->>'cargo'='11','crew, exactly two cargo dice');
 s:=private.ship_cap_voyage_action(s,'bank','{}',900000);
 PERFORM pg_temp.check_voyage(s#>>'{banks,0,points}'='770' AND s->>'cargo' IS NULL AND s->>'roll'='4' AND s->>'score'='0','bank at 8 left; no timer, no auto roll, provisional only');
 BEGIN PERFORM private.ship_cap_voyage_action(s,'bank','{}',900001);RAISE EXCEPTION 'double bank accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%illegal_action%' THEN RAISE;END IF;END;
 FOR i IN 5..7 LOOP s:=private.ship_cap_voyage_apply_roll(s,'[6,5,4,4,4]',1000+i);END LOOP;
 s:=private.ship_cap_voyage_action(s,'bank','{}',900002);
 FOR i IN 8..10 LOOP s:=private.ship_cap_voyage_apply_roll(s,'[6,5,4,4,5]',1000+i);END LOOP;
 s:=private.ship_cap_voyage_action(s,'bank','{}',900003);
 PERFORM pg_temp.check_voyage(s#>>'{banks,1,points}'='325' AND s#>>'{banks,2,points}'='310' AND s#>>'{result,total}'='1405','verified 1405 example');
 FOR i IN 2..12 LOOP
  t:=private.ship_cap_voyage_apply_roll(initial,jsonb_build_array(6,5,4,greatest(1,i-6),least(6,i-1)),1001);
  IF i=2 THEN
   BEGIN PERFORM private.ship_cap_voyage_action(t,'bank','{}',1002);RAISE EXCEPTION 'snake eyes accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%illegal_action%' THEN RAISE;END IF;END;
  ELSE
   t:=private.ship_cap_voyage_action(t,'bank','{}',1002);
   PERFORM pg_temp.check_voyage((t#>>'{banks,0,base}')::int=(ARRAY[30,45,65,90,125,175,250,365,530,800])[i-2],'nonlinear base '||i);
  END IF;
 END LOOP;
 FOR n IN 0..2 LOOP
  t:=initial;
  FOR i IN 1..12 LOOP
   t:=private.ship_cap_voyage_apply_roll(t,CASE WHEN i=12 THEN '[6,5,4,1,1]'::jsonb ELSE '[6,5,4,6,6]'::jsonb END,1000+i);
   IF i<=n THEN t:=private.ship_cap_voyage_action(t,'bank','{}',1000+i);END IF;
  END LOOP;
  PERFORM pg_temp.check_voyage(t->>'phase'='summary' AND t#>>'{result,total}'='0' AND t->>'score'='0','incomplete banks '||n||' all forfeit');
 END LOOP;
 t:=initial;
 FOR i IN 1..12 LOOP
  t:=private.ship_cap_voyage_apply_roll(t,'[6,5,4,1,2]',1000+i);
  IF i IN(1,2,12) THEN t:=private.ship_cap_voyage_action(t,'bank','{}',1000+i);END IF;
 END LOOP;
 PERFORM pg_temp.check_voyage(t#>>'{banks,2,bonus}'='0' AND t#>>'{result,total}'='720','third bank on roll 12');
 BEGIN PERFORM private.ship_cap_voyage_action(t,'roll','{}',2000);RAISE EXCEPTION '13th roll accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%illegal_action%' THEN RAISE;END IF;END;
 t:=private.ship_cap_voyage_action(t,'next_round','{}',3000);
 PERFORM pg_temp.check_voyage(t->>'round'='2' AND t->>'roll'='0' AND t->'dice'='[]'::jsonb AND t->'locked'='[]'::jsonb AND t->'banks'='[]'::jsonb,'next round resets all transients without roll');
 t:=private.ship_cap_voyage_apply_roll(initial,'[6,5,4,1,2]',1001);
 BEGIN PERFORM private.ship_cap_voyage_apply_roll(t,'[1,5,4,1,2]',1002);RAISE EXCEPTION 'lock changed';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%locked_die%' THEN RAISE;END IF;END;
 t:=initial;
 FOR i IN 1..12 LOOP t:=private.ship_cap_voyage_apply_roll(t,'[5,4,3,2,1]',1000+i);END LOOP;
 PERFORM pg_temp.check_voyage(t->'locked'='[]'::jsonb AND t#>>'{result,total}'='0','never qualifies');
 t:=initial;
 FOR i IN 1..10 LOOP t:=private.ship_cap_voyage_apply_roll(t,'[5,4,3,2,1]',1000+i);END LOOP;
 t:=private.ship_cap_voyage_apply_roll(t,'[6,5,4,2,3]',1011);
 t:=private.ship_cap_voyage_action(t,'bank','{}',1011);
 t:=private.ship_cap_voyage_apply_roll(t,'[6,5,4,6,6]',1012);
 PERFORM pg_temp.check_voyage(t#>>'{result,total}'='0' AND jsonb_array_length(t->'banks')=1,'late qualification has no phantom banks');
 FOR i IN 1..100 LOOP
  t:=private.ship_cap_voyage_action(initial,'roll','{}',1001);
  PERFORM pg_temp.check_voyage(jsonb_array_length(t->'dice')=5 AND NOT EXISTS(SELECT FROM jsonb_array_elements(t->'dice')d WHERE d::text !~ '^[1-6]$'),'secure dice bounds');
 END LOOP;
END$$;
DO $$
DECLARE actor uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();rid uuid;request uuid:=gen_random_uuid();run jsonb;v jsonb;before_v jsonb;response jsonb;round_i int;bank_i int;s jsonb;final_request uuid;final_before jsonb;recovery_token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(stranger);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true),(stranger,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'Voyage proof',true),(stranger,'Voyage stranger',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=null;
 UPDATE private.arcade_rulesets SET enabled=false WHERE game='ship-cap-voyage';
 BEGIN PERFORM public.arcade_start(actor,request,'ship-cap-voyage');RAISE EXCEPTION 'closed admission accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;END;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='ship-cap-voyage/1';
 run:=public.arcade_start(actor,request,'ship-cap-voyage');rid:=(run->>'id')::uuid;
 PERFORM pg_temp.check_voyage(public.arcade_start(actor,request,'ship-cap-voyage')->>'id'=rid::text,'duplicate start');
 PERFORM pg_temp.check_voyage(public.arcade_start(actor,gen_random_uuid(),'ship-cap-voyage')->>'id'=rid::text,'one active run');
 BEGIN PERFORM public.arcade_ship_cap_voyage_step(stranger,rid);RAISE EXCEPTION 'stranger allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_ship_cap_voyage_step(NULL,rid);RAISE EXCEPTION 'worker allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.check_voyage(NOT has_function_privilege('authenticated','public.arcade_ship_cap_voyage_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','execute'),'service only RPC');
 CREATE TEMP TABLE voyage_writes ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables WHERE schemaname IN('public','private') AND relname NOT LIKE 'arcade_%';
 UPDATE private.arcade_recovery_state SET token=recovery_token,claimed=true,expires_at=clock_timestamp()+interval '1 minute';
 v:=public.arcade_ship_cap_voyage_step(NULL,rid,p_token=>recovery_token)->'projection';
 PERFORM pg_temp.check_voyage(v->>'roll'='0' AND v->'dice'='[]'::jsonb,'zero-client initialization never rolls');
 v:=public.arcade_ship_cap_voyage_step(actor,rid)->'projection';before_v:=v;request:=gen_random_uuid();
 v:=public.arcade_ship_cap_voyage_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'roll','{}')->'projection';
 PERFORM pg_temp.check_voyage(v->>'roll'='1' AND NOT v ?| ARRAY['seed','future','config'],'one roll, private randomness');
 PERFORM pg_temp.check_voyage(public.arcade_ship_cap_voyage_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'roll','{}')->>'outcome'='duplicate','exact roll replay');
 PERFORM pg_temp.check_voyage(public.arcade_ship_cap_voyage_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',gen_random_uuid(),'roll','{}')->>'outcome'='stale','competing revision rejected');
 BEGIN PERFORM public.arcade_ship_cap_voyage_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'bank','{}');RAISE EXCEPTION 'changed replay accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%request_conflict%' THEN RAISE;END IF;END;
 UPDATE private.arcade_recovery_state SET token=recovery_token,claimed=true,expires_at=clock_timestamp()+interval '1 minute';
 -- Recovery does not roll, bank or leave a manual waiting state.
 PERFORM public.arcade_ship_cap_voyage_step(NULL,rid,p_token=>recovery_token);
 FOR round_i IN 1..3 LOOP
  FOR bank_i IN 1..3 LOOP
   SELECT state INTO s FROM private.arcade_runs WHERE id=rid;
   -- Deterministic local-only roll fixture; full RPC still owns every bank/receipt/result.
   s:=jsonb_set(s,'{dice}','[6,5,4,6,6]');s:=jsonb_set(s,'{locked}','[0,1,2]');
   s:=s||jsonb_build_object('cargo',12,'roll',bank_i);
   UPDATE private.arcade_runs SET state=s WHERE id=rid;
   v:=public.arcade_ship_cap_voyage_step(actor,rid)->'projection';before_v:=v;request:=gen_random_uuid();
   IF round_i=3 AND bank_i=3 THEN
    CREATE FUNCTION pg_temp.voyage_fail() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN RAISE EXCEPTION 'injected voyage result failure';END$f$;
    CREATE TRIGGER voyage_atomic BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.voyage_fail();
    BEGIN PERFORM public.arcade_ship_cap_voyage_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'bank','{}');RAISE EXCEPTION 'missing fault';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected voyage%' THEN RAISE;END IF;END;
    PERFORM pg_temp.check_voyage(NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=rid) AND NOT EXISTS(SELECT FROM private.arcade_command_receipts WHERE request_id=request),'atomic result/receipt rollback');
    DROP TRIGGER voyage_atomic ON private.arcade_results;final_request:=request;final_before:=before_v;
   END IF;
   v:=public.arcade_ship_cap_voyage_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'bank','{}')->'projection';
   PERFORM pg_temp.check_voyage(public.arcade_ship_cap_voyage_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'bank','{}')->>'outcome'='duplicate','bank replay');
  END LOOP;
  PERFORM pg_temp.check_voyage(v#>>'{result,total}'='3300' AND v->>'phase'='summary','durable round result');
  IF round_i<3 THEN
   v:=public.arcade_ship_cap_voyage_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'next_round','{}')->'projection';
   PERFORM pg_temp.check_voyage(v->>'roll'='0' AND v->'dice'='[]'::jsonb,'manual next opening');
  END IF;
 END LOOP;
 PERFORM pg_temp.check_voyage(v->>'status'='completed' AND v->>'score'='9900' AND jsonb_array_length(v->'results')=3,'complete final scoreboard');
 PERFORM pg_temp.check_voyage((SELECT count(*) FROM private.arcade_results WHERE run_id=rid)=1,'one immutable leaderboard result');
 PERFORM pg_temp.check_voyage((public.arcade_ship_cap_voyage_step(actor,rid)->'projection')-'serverAt'=v-'serverAt','reconnect retains final');
 run:=public.arcade_start(actor,gen_random_uuid(),'ship-cap-voyage');
 PERFORM pg_temp.check_voyage(public.arcade_ship_cap_voyage_step(actor,rid,(final_before->>'revision')::bigint,final_before->>'roundId',final_request,'bank','{}')->>'outcome'='duplicate','late replay after successor');
 rid:=(run->>'id')::uuid;v:=public.arcade_ship_cap_voyage_step(actor,rid)->'projection';
 v:=public.arcade_ship_cap_voyage_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}')->'projection';
 PERFORM pg_temp.check_voyage(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=rid),'abandon unranked');
 PERFORM pg_temp.check_voyage(NOT EXISTS(SELECT FROM voyage_writes b JOIN pg_stat_xact_user_tables t USING(relid) WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>b.n),'zero non-Arcade/session/financial writes');
END$$;
SELECT 'PASS rules, 1405, snake eyes, roll 12, manual progression, replay, ownership, atomicity, recovery, immutable completion, financial isolation' AS evidence;
ROLLBACK;
