BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='25s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.assert357v2(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '357 v2: %',label;END IF;END$$;
DO $$
DECLARE actor uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();run jsonb;v jsonb;before_v jsonb;reply jsonb;s jsonb;old_deck jsonb;
 request uuid;run_id_i uuid;round_i integer;i integer;j integer;total bigint:=0;at_ms bigint;last_revision bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(stranger);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true),(stranger,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'357 v2 proof',true),(stranger,'357 v2 stranger',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_rulesets SET enabled=false WHERE game='357-drop';
 BEGIN PERFORM public.arcade_start(actor,gen_random_uuid(),'357-drop');RAISE EXCEPTION 'closed admission accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;END;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='357-drop/2';
 UPDATE private.arcade_recovery_state SET failure=null,last_completed_at=clock_timestamp(),token='35735735-7357-4357-8357-357357357357',claimed=true,expires_at=clock_timestamp()+interval '1 minute';
 CREATE TEMP TABLE v2_write_baseline ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables WHERE schemaname IN('public','private') AND relname NOT LIKE 'arcade_%';
 request:=gen_random_uuid();run:=public.arcade_start(actor,request,'357-drop');run_id_i:=(run->>'id')::uuid;
 PERFORM pg_temp.assert357v2(public.arcade_start(actor,request,'357-drop')->>'id'=run_id_i::text,'duplicate admission');
 PERFORM pg_temp.assert357v2(public.arcade_start(actor,gen_random_uuid(),'357-drop')->>'id'=run_id_i::text,'single active run');
 v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
 PERFORM pg_temp.assert357v2(v->>'phase'='intro' AND v->>'round'='1' AND v->>'passesLeft'='3' AND NOT v ?| ARRAY['deck','config','cursor','roundsEvidence'],'opening and private projection');
 BEGIN PERFORM public.arcade_drop357_step(stranger,run_id_i);RAISE EXCEPTION 'stranger accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_drop357_step(NULL,run_id_i);RAISE EXCEPTION 'bad token accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'place',ARRAY[0]);RAISE EXCEPTION 'intro placement accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_playing%' THEN RAISE;END IF;END;
 FOR round_i IN 1..3 LOOP
  SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=run_id_i;
  IF old_deck IS NOT NULL THEN PERFORM pg_temp.assert357v2(s->'deck'<>old_deck,'fresh shuffle');END IF;old_deck:=s->'deck';
  PERFORM pg_temp.assert357v2(s->>'round'=round_i::text AND s->>'passesLeft'='3' AND (s->>'playDeadline')::bigint-(s->>'startedAt')::bigint=120000,'round resets and full playing time');
  UPDATE private.arcade_runs SET state=private.drop357_v2_advance(state,(state->>'deadline')::bigint) WHERE arcade_runs.id=run_id_i;
  v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
  FOR i IN 0..2 LOOP FOR j IN 1..(ARRAY[3,5,7])[i+1] LOOP
   before_v:=v;request:=gen_random_uuid();
   IF round_i=3 AND i=2 AND j=7 THEN
    CREATE FUNCTION pg_temp.abort357v2() RETURNS trigger LANGUAGE plpgsql AS $g$BEGIN RAISE EXCEPTION 'injected v2 result failure';END$g$;
    CREATE TRIGGER v2_atomic BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.abort357v2();
    BEGIN PERFORM public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',request,'place',ARRAY[i]);RAISE EXCEPTION 'fault not raised';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected v2%' THEN RAISE;END IF;END;
    PERFORM pg_temp.assert357v2((SELECT revision FROM private.arcade_runs WHERE arcade_runs.id=run_id_i)=(v->>'revision')::bigint AND NOT EXISTS(SELECT FROM private.arcade_command_receipts WHERE request_id=request),'atomic terminal rollback');
    DROP TRIGGER v2_atomic ON private.arcade_results;
   END IF;
   reply:=public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',request,'place',ARRAY[i]);v:=reply->'projection';
   PERFORM pg_temp.assert357v2(reply->>'outcome'='committed','accepted placement');
   PERFORM pg_temp.assert357v2(public.arcade_drop357_step(actor,run_id_i,(before_v->>'revision')::bigint,before_v->>'roundId',request,'place',ARRAY[i])->>'outcome'='duplicate','exact duplicate');
  END LOOP;END LOOP;
  total:=total+(v#>>'{result,roundScore}')::bigint;
  PERFORM pg_temp.assert357v2(jsonb_array_length(v->'roundScores')=round_i,'all completed round summaries');
  PERFORM pg_temp.assert357v2((SELECT sum((x->>'score')::bigint) FROM jsonb_array_elements(v->'roundScores')x)=total,'round summaries sum to final score');
  PERFORM pg_temp.assert357v2(NOT EXISTS(SELECT FROM jsonb_array_elements(v->'roundScores')x
   WHERE (x->>'handPoints')::bigint+(x->>'naturalBonus')::bigint+(x->>'allBonus')::bigint+(x->>'timeBonus')::bigint<>(x->>'score')::bigint
   OR (SELECT count(*) FROM jsonb_object_keys(x))<>6
   OR NOT x ?& ARRAY['round','score','handPoints','naturalBonus','allBonus','timeBonus']),'bonuses add up and summary exposes no private state');
  PERFORM pg_temp.assert357v2((v->>'score')::bigint=total AND v->>'phase'='stage_complete','banked cumulative total');
  PERFORM pg_temp.assert357v2((SELECT count(*) FROM private.arcade_results WHERE run_id=run_id_i)=CASE WHEN round_i=3 THEN 1 ELSE 0 END,'only final result');
  IF round_i<3 THEN
   SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=run_id_i;
   PERFORM pg_temp.assert357v2(private.drop357_v2_advance(s,(s->>'deadline')::bigint-1)=s,'tally hold');
   UPDATE private.arcade_runs SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE arcade_runs.id=run_id_i;
   v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
   PERFORM pg_temp.assert357v2(v->>'phase'='intro' AND (v->>'deadline')::bigint>=(v->>'serverAt')::bigint+2400,'next intro before clock');
   reply:=public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,before_v->>'roundId',gen_random_uuid(),'place',ARRAY[0]);
   PERFORM pg_temp.assert357v2(reply->>'outcome'='stale','old round cannot cross boundary');
  END IF;
 END LOOP;
 SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=run_id_i;
 PERFORM pg_temp.assert357v2(public.arcade_drop357_step(actor,run_id_i)->'projection'->'roundScores'=v->'roundScores','finished refresh preserves summaries');
 PERFORM pg_temp.assert357v2(private.drop357_valid_dispatch(s) AND NOT private.drop357_valid_dispatch(jsonb_set(s,'{score}','9999999')),'validated final sum');
 PERFORM pg_temp.assert357v2(NOT private.drop357_valid_dispatch(jsonb_set(s,'{rounds,0,score}','9999999')),'historical round tampering rejected');
 run:=public.arcade_start(actor,gen_random_uuid(),'357-drop');
 PERFORM pg_temp.assert357v2(run->>'id'<>run_id_i::text,'successor');
 PERFORM pg_temp.assert357v2(public.arcade_drop357_step(actor,run_id_i,(before_v->>'revision')::bigint,before_v->>'roundId',request,'place',ARRAY[2])->>'outcome'='duplicate','late final replay');
 run_id_i:=(run->>'id')::uuid;v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
 v:=public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}')->'projection';
 PERFORM pg_temp.assert357v2(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=run_id_i),'abandon unranked');
 -- Cold recovery traverses every intro, timeout and result hold without a client.
 FOR i IN 1..2 LOOP
  run:=public.arcade_start(CASE WHEN i=1 THEN actor ELSE stranger END,gen_random_uuid(),'357-drop');run_id_i:=(run->>'id')::uuid;
  UPDATE private.arcade_runs SET state=private.drop357_v2_deal(jsonb_build_object('runId',run_id_i,'userId',user_id,'status','active','config',config),floor(extract(epoch FROM clock_timestamp())*1000)::bigint-400000,1) WHERE arcade_runs.id=run_id_i;
  v:=public.arcade_drop357_step(NULL,run_id_i,p_token=>'35735735-7357-4357-8357-357357357357')->'projection';
  PERFORM pg_temp.assert357v2(v->>'round'='3' AND v->>'status'='completed' AND v->>'score'='0','zero-client three-round timeout');
  last_revision:=(v->>'revision')::bigint;PERFORM public.arcade_drop357_step(NULL,run_id_i,p_token=>'35735735-7357-4357-8357-357357357357');
  PERFORM pg_temp.assert357v2((SELECT revision FROM private.arcade_runs WHERE arcade_runs.id=run_id_i)=last_revision AND (SELECT count(*) FROM private.arcade_results WHERE run_id=run_id_i)=1,'recovery replay');
 END LOOP;
 reply:=public.arcade_leaderboard(actor,'357-drop','all');
 PERFORM pg_temp.assert357v2(reply->>'ruleset'='357-drop/2' AND (SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(reply->'rows')x WHERE x->>'score'='0')=1,'version separation and ties');
 PERFORM pg_temp.assert357v2(NOT EXISTS(SELECT FROM v2_write_baseline b JOIN pg_stat_xact_user_tables t USING(relid) WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>b.n),'no multiplayer or financial writes');
END $$;
SELECT 'PASS: 357 v2 three-round rollback proof' result;
ROLLBACK;

