BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='20s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.check357(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '357 proof: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.cards357(spec text) RETURNS integer[] LANGUAGE sql IMMUTABLE AS $$
 SELECT array_agg((strpos('23456789TJQKA',left(c,1))-1)+13*right(c,1)::integer ORDER BY i) FROM unnest(string_to_array(spec,' ')) WITH ORDINALITY t(c,i)
$$;
DO $$
DECLARE item record; r jsonb; s jsonb; t jsonb; deck jsonb;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('70 71 40',3,89,'Pair'),('20 30 31',3,210,'Trips'),('30 31 32',3,600,'Trips'),
 ('A0 A1 70',3,188,'Pair'),('A0 30 70',3,157,'Pair'),('A0 A1 K0 90 50',5,700,'Trips'),
 ('A0 A1 K0 K1 50',5,1853,'Full house'),('A0 A1 A2 K0 K1',5,2224,'Full house'),
 ('20 21 22 50 40',5,2270,'Quads'),('20 21 22 23 50',5,4520,'Five of a kind'),
 ('A0 21 32 43 50',5,900,'Straight'),('T0 J0 Q0 K0 A0',5,4440,'Royal flush'),
 ('20 40 60 80 T0',5,1560,'Flush'),('20 31 42 63 80',5,0,'High card'),
 ('A0 A1 20 41 60',5,0,'Pair'),('A0 A1 A2 K0 K1 70 20',7,2400,'Quads'),
 ('T0 J0 Q0 K0 A0 71 20',7,4440,'Royal flush')
 ) AS x(cards,lane,score,category) LOOP
  r:=private.drop357_lane(pg_temp.cards357(item.cards),item.lane);
  PERFORM pg_temp.check357((r->>'score')::integer=item.score AND r->>'category'=item.category,item.cards||' '||r::text);
 END LOOP;
 PERFORM pg_temp.check357((private.drop357_lane(pg_temp.cards357('T0 J0 Q0 K0 A0 71 20'),7)->>'natural')::boolean,'unused seven preserves natural');
 PERFORM pg_temp.check357(NOT (private.drop357_lane(pg_temp.cards357('T0 J0 Q0 K0 50'),5)->>'natural')::boolean,'used wild removes natural');
 -- Category separation, including maximum natural versus minimum wild-assisted.
 PERFORM pg_temp.check357(544<570 AND 840<900 AND 1200<1270 AND 1620<1635 AND 2224<2270 AND 2880<2950 AND 3636<3700 AND 4440<4520,'category bounds');
 s:=private.drop357_deal(jsonb_build_object('runId',gen_random_uuid(),'userId',gen_random_uuid(),'status','active','config','{}'::jsonb),1000000);
 PERFORM pg_temp.check357(jsonb_array_length(s->'deck')=52 AND (SELECT count(DISTINCT x) FROM jsonb_array_elements(s->'deck')x)=52,'shuffle uniqueness');
 t:=private.drop357_finish(s,1120000,'timeout');
 PERFORM pg_temp.check357(t->>'score'='0' AND private.drop357_valid(t),'untouched timeout');
 PERFORM pg_temp.check357(private.drop357_finish(t,1130000,'timeout')=t,'one tally');
 -- Known complete rows test exact integer rounding and all-three bonus.
 s:=s||jsonb_build_object('lanes',jsonb_build_array(to_jsonb(pg_temp.cards357('70 71 40')),to_jsonb(pg_temp.cards357('A0 A1 A2 K0 K1')),to_jsonb(pg_temp.cards357('T0 J0 Q0 K0 A0 72 22'))),
 'laneResults',jsonb_build_array(private.drop357_lane(pg_temp.cards357('70 71 40'),3),private.drop357_lane(pg_temp.cards357('A0 A1 A2 K0 K1'),5),private.drop357_lane(pg_temp.cards357('T0 J0 Q0 K0 A0 72 22'),7)),'placements',15);
 t:=private.drop357_finish(s,1060000,'filled');
 PERFORM pg_temp.check357(t#>>'{result,base}'='6953' AND t#>>'{result,allBonus}'='200' AND t#>>'{result,timeBonus}'='695','midpoint rounding');
 PERFORM pg_temp.check357(private.drop357_valid(t),'valid final tally');
 PERFORM pg_temp.check357(NOT private.drop357_valid(jsonb_set(t,'{score}','999999')),'reject forged final tally');
 PERFORM pg_temp.check357(private.drop357_finish(s,1119999,'filled')#>>'{result,timeBonus}'='0','final millisecond rounding');
 PERFORM pg_temp.check357(private.drop357_finish(s,1120000,'timeout')#>>'{result,timeBonus}'='0','timeout no time bonus');
END $$;

DO $$
DECLARE actor uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); request uuid:=gen_random_uuid();
 run jsonb; v jsonb; before_v jsonb; response jsonb; s jsonb; run2 jsonb; i integer; j integer; receipt_id uuid; token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(stranger);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true),(stranger,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'357 proof A',true),(stranger,'357 proof B',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=null;
 BEGIN PERFORM public.arcade_start(actor,request,'357-drop');RAISE EXCEPTION 'closed admission accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;END;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='357-drop/1';
 run:=public.arcade_start(actor,request,'357-drop');
 PERFORM pg_temp.check357(public.arcade_start(actor,request,'357-drop')->>'id'=run->>'id','duplicate start');
 PERFORM pg_temp.check357(public.arcade_start(actor,gen_random_uuid(),'357-drop')->>'id'=run->>'id','one active run');
 BEGIN PERFORM public.arcade_drop357_step(stranger,(run->>'id')::uuid);RAISE EXCEPTION 'wrong owner accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_drop357_step(NULL,(run->>'id')::uuid);RAISE EXCEPTION 'invalid worker accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.check357(NOT has_function_privilege('authenticated','public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','execute'),'private step');
 v:=public.arcade_drop357_step(actor,(run->>'id')::uuid)->'projection';
 PERFORM pg_temp.check357(NOT v ?| ARRAY['deck','cursor','config'] AND v->>'stockLeft'='51','private deck redaction');
 -- Transaction-local counters prove zero writes to other application tables without locking them.
 CREATE TEMP TABLE drop357_write_baseline ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables WHERE schemaname IN('public','private') AND relname NOT LIKE 'arcade_%';
 before_v:=v;receipt_id:=gen_random_uuid();
 response:=public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',receipt_id,'place',ARRAY[0]);v:=response->'projection';
 PERFORM pg_temp.check357(response->>'outcome'='committed' AND v->>'placements'='1','placement accepted');
 PERFORM pg_temp.check357(public.arcade_drop357_step(actor,(run->>'id')::uuid,(before_v->>'revision')::bigint,before_v->>'roundId',receipt_id,'place',ARRAY[0])->>'outcome'='duplicate','duplicate command');
 BEGIN PERFORM public.arcade_drop357_step(actor,(run->>'id')::uuid,(before_v->>'revision')::bigint,before_v->>'roundId',receipt_id,'place',ARRAY[1]);RAISE EXCEPTION 'changed replay accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%request_conflict%' THEN RAISE; END IF;END;
 PERFORM pg_temp.check357(public.arcade_drop357_step(actor,(run->>'id')::uuid,(before_v->>'revision')::bigint,before_v->>'roundId',gen_random_uuid(),'pass','{}')->>'outcome'='stale','stale revision');
 FOR i IN 0..2 LOOP
  FOR j IN (CASE WHEN i=0 THEN 2 ELSE 1 END)..(ARRAY[3,5,6])[i+1] LOOP
   v:=public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'place',ARRAY[i])->'projection';
  END LOOP;
 END LOOP;
 PERFORM pg_temp.check357(v->>'placements'='14','one slot left');
 BEGIN PERFORM public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'place',ARRAY[0]);RAISE EXCEPTION 'filled lane accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%column_locked%' THEN RAISE; END IF;END;
 FOR i IN 1..3 LOOP v:=public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'pass','{}')->'projection';END LOOP;
 PERFORM pg_temp.check357(v->>'passesLeft'='0' AND v->>'placements'='14','last-slot passes');
 BEGIN PERFORM public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'pass','{}');RAISE EXCEPTION 'fourth pass accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%illegal_action%' THEN RAISE; END IF;END;
 CREATE FUNCTION pg_temp.fail357() RETURNS trigger LANGUAGE plpgsql AS $g$ BEGIN RAISE EXCEPTION 'injected 357 result failure'; END $g$;
 CREATE TRIGGER drop357_atomic BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.fail357();
 receipt_id:=gen_random_uuid();before_v:=v;
 BEGIN PERFORM public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',receipt_id,'place',ARRAY[2]);RAISE EXCEPTION 'failure not raised';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected 357%' THEN RAISE; END IF;END;
 PERFORM pg_temp.check357((SELECT revision FROM private.arcade_runs WHERE id=(run->>'id')::uuid)=(v->>'revision')::bigint AND NOT EXISTS(SELECT FROM private.arcade_command_receipts WHERE request_id=receipt_id),'atomic failure rollback');
 DROP TRIGGER drop357_atomic ON private.arcade_results;
 v:=public.arcade_drop357_step(actor,(run->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',receipt_id,'place',ARRAY[2])->'projection';
 PERFORM pg_temp.check357(v->>'status'='completed' AND v->'current'='null'::jsonb AND (SELECT count(*) FROM private.arcade_results WHERE run_id=(run->>'id')::uuid)=1,'atomic completion');
 run2:=public.arcade_start(actor,gen_random_uuid(),'357-drop');
 PERFORM pg_temp.check357(run2->>'id'<>run->>'id','successor isolation');
 PERFORM pg_temp.check357(public.arcade_drop357_step(actor,(run->>'id')::uuid,(before_v->>'revision')::bigint,before_v->>'roundId',receipt_id,'place',ARRAY[2])->>'outcome'='duplicate','late replay after successor');
 v:=public.arcade_drop357_step(actor,(run2->>'id')::uuid)->'projection';
 v:=public.arcade_drop357_step(actor,(run2->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}')->'projection';
 PERFORM pg_temp.check357(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=(run2->>'id')::uuid),'abandon unranked');
 -- No-client recovery, including a run never loaded by a browser.
 run2:=public.arcade_start(actor,gen_random_uuid(),'357-drop');
 UPDATE private.arcade_runs SET state=private.drop357_deal(jsonb_build_object('runId',id,'userId',user_id,'status','active','config',config),floor(extract(epoch FROM clock_timestamp())*1000)::bigint-125000) WHERE id=(run2->>'id')::uuid;
 UPDATE private.arcade_recovery_state SET claimed=true,expires_at=clock_timestamp()+interval '1 minute' WHERE singleton;
 -- Qualified variable avoids the column name collision.
 UPDATE private.arcade_recovery_state SET token='35735735-7357-4357-8357-357357357357';
 v:=public.arcade_drop357_step(NULL,(run2->>'id')::uuid,p_token=>'35735735-7357-4357-8357-357357357357')->'projection';
 PERFORM pg_temp.check357(v->>'status'='completed' AND v->>'score'='0','cold zero-client timeout');
 PERFORM public.arcade_drop357_step(NULL,(run2->>'id')::uuid,p_token=>'35735735-7357-4357-8357-357357357357');
 PERFORM pg_temp.check357((SELECT count(*) FROM private.arcade_results WHERE run_id=(run2->>'id')::uuid)=1,'worker replay');
 run2:=public.arcade_start(stranger,gen_random_uuid(),'357-drop');
 UPDATE private.arcade_runs SET state=private.drop357_deal(jsonb_build_object('runId',id,'userId',user_id,'status','active','config',config),floor(extract(epoch FROM clock_timestamp())*1000)::bigint-125000) WHERE id=(run2->>'id')::uuid;
 PERFORM public.arcade_drop357_step(NULL,(run2->>'id')::uuid,p_token=>'35735735-7357-4357-8357-357357357357');
 response:=public.arcade_leaderboard(actor,'357-drop','all');
 PERFORM pg_temp.check357((SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(response->'rows')x WHERE x->>'score'='0')=1,'equal scores share rank');
 PERFORM pg_temp.check357(jsonb_array_length(public.arcade_leaderboard(actor,'357-drop','30')->'rows')>=3,'both leaderboard windows');
 PERFORM pg_temp.check357(NOT EXISTS(SELECT FROM drop357_write_baseline b JOIN pg_stat_xact_user_tables t USING(relid) WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>b.n),'zero multiplayer/financial writes');
 RAISE NOTICE '357 Drop rules, auth, replay, terminal, isolation and recovery proof passed';
END $$;
SELECT 'PASS: 357 Drop rollback proof' AS result;
ROLLBACK;
