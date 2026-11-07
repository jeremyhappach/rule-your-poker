BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='25s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.assert357v3(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '357 v3: %',label;END IF;END$$;
DO $$
DECLARE actor uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();run jsonb;v jsonb;before_v jsonb;reply jsonb;s jsonb;old_deck jsonb;
 request uuid;run_id_i uuid;round_i integer;i integer;j integer;total bigint:=0;at_ms bigint;last_revision bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(stranger);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true),(stranger,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'357 v3 proof',true),(stranger,'357 v3 stranger',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_rulesets SET enabled=false WHERE game='357-drop';
 BEGIN PERFORM public.arcade_start(actor,gen_random_uuid(),'357-drop');RAISE EXCEPTION 'closed admission accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;END;
 PERFORM private.drop357_select_ruleset(true);
 UPDATE private.arcade_recovery_state SET failure=null,last_completed_at=clock_timestamp(),token='35735735-7357-4357-8357-357357357357',claimed=true,expires_at=clock_timestamp()+interval '1 minute';
 CREATE TEMP TABLE v3_write_baseline ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables WHERE schemaname IN('public','private') AND relname NOT LIKE 'arcade_%';
 request:=gen_random_uuid();run:=public.arcade_start(actor,request,'357-drop');run_id_i:=(run->>'id')::uuid;
 PERFORM pg_temp.assert357v3(public.arcade_start(actor,request,'357-drop')->>'id'=run_id_i::text,'duplicate admission');
 PERFORM pg_temp.assert357v3(public.arcade_start(actor,gen_random_uuid(),'357-drop')->>'id'=run_id_i::text,'single active run');
 v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
 PERFORM pg_temp.assert357v3(v->>'phase'='intro' AND v->>'round'='1' AND v->>'passesLeft'='5' AND NOT v ?| ARRAY['deck','config','cursor','roundsEvidence'],'opening and private projection');
 BEGIN PERFORM public.arcade_drop357_step(stranger,run_id_i);RAISE EXCEPTION 'stranger accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_drop357_step(NULL,run_id_i);RAISE EXCEPTION 'bad token accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'place',ARRAY[0]);RAISE EXCEPTION 'intro placement accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_playing%' THEN RAISE;END IF;END;
 FOR round_i IN 1..3 LOOP
  SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=run_id_i;
  IF old_deck IS NOT NULL THEN PERFORM pg_temp.assert357v3(s->'deck'<>old_deck,'fresh shuffle');END IF;old_deck:=s->'deck';
  PERFORM pg_temp.assert357v3(s->>'round'=round_i::text AND s->>'passesLeft'='5' AND (s->>'playDeadline')::bigint-(s->>'startedAt')::bigint=120000,'round resets and full playing time');
  UPDATE private.arcade_runs SET state=private.drop357_v3_advance(state,(state->>'deadline')::bigint) WHERE arcade_runs.id=run_id_i;
  v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
  FOR i IN 0..2 LOOP FOR j IN 1..(ARRAY[3,2,2])[i+1] LOOP
   before_v:=v;request:=gen_random_uuid();
   IF round_i=3 AND i=2 AND j=2 THEN
    CREATE FUNCTION pg_temp.abort357v3() RETURNS trigger LANGUAGE plpgsql AS $g$BEGIN RAISE EXCEPTION 'injected v3 result failure';END$g$;
    CREATE TRIGGER v3_atomic BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.abort357v3();
    BEGIN PERFORM public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',request,'place',ARRAY[i,(ARRAY[0,3,5])[i+1]+j-1]);RAISE EXCEPTION 'fault not raised';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected v3%' THEN RAISE;END IF;END;
    PERFORM pg_temp.assert357v3((SELECT revision FROM private.arcade_runs WHERE arcade_runs.id=run_id_i)=(v->>'revision')::bigint AND NOT EXISTS(SELECT FROM private.arcade_command_receipts WHERE request_id=request),'atomic terminal rollback');
    DROP TRIGGER v3_atomic ON private.arcade_results;
   END IF;
   reply:=public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',request,'place',ARRAY[i,(ARRAY[0,3,5])[i+1]+j-1]);v:=reply->'projection';
   PERFORM pg_temp.assert357v3(reply->>'outcome'='committed' AND v->>'acceptedRequestId'=request::text,'accepted placement exact receipt');
   PERFORM pg_temp.assert357v3(public.arcade_drop357_step(actor,run_id_i,(before_v->>'revision')::bigint,before_v->>'roundId',request,'place',ARRAY[i,(ARRAY[0,3,5])[i+1]+j-1])->>'outcome'='duplicate','exact duplicate');
  END LOOP;END LOOP;
  total:=total+(v#>>'{result,roundScore}')::bigint;
  PERFORM pg_temp.assert357v3(jsonb_array_length(v->'roundScores')=round_i,'all completed round summaries');
  PERFORM pg_temp.assert357v3((SELECT sum((x->>'score')::bigint) FROM jsonb_array_elements(v->'roundScores')x)=total,'round summaries sum to final score');
  PERFORM pg_temp.assert357v3(NOT EXISTS(SELECT FROM jsonb_array_elements(v->'roundScores')x
   WHERE (x->>'handPoints')::bigint+(x->>'naturalBonus')::bigint+(x->>'allBonus')::bigint+(x->>'timeBonus')::bigint<>(x->>'score')::bigint
   OR (SELECT count(*) FROM jsonb_object_keys(x))<>6
   OR NOT x ?& ARRAY['round','score','handPoints','naturalBonus','allBonus','timeBonus']),'bonuses add up and summary exposes no private state');
  PERFORM pg_temp.assert357v3((v->>'score')::bigint=total AND v->>'phase'='stage_complete','banked cumulative total');
  PERFORM pg_temp.assert357v3((SELECT count(*) FROM private.arcade_results WHERE run_id=run_id_i)=CASE WHEN round_i=3 THEN 1 ELSE 0 END,'only final result');
  IF round_i<3 THEN
   SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=run_id_i;
   PERFORM pg_temp.assert357v3(private.drop357_v3_advance(s,(s->>'deadline')::bigint-1)=s,'tally hold');
   UPDATE private.arcade_runs SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE arcade_runs.id=run_id_i;
   v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
   PERFORM pg_temp.assert357v3(v->>'phase'='intro' AND (v->>'deadline')::bigint>=(v->>'serverAt')::bigint+2400,'next intro before clock');
   reply:=public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,before_v->>'roundId',gen_random_uuid(),'place',ARRAY[0]);
   PERFORM pg_temp.assert357v3(reply->>'outcome'='stale','old round cannot cross boundary');
  END IF;
 END LOOP;
 SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=run_id_i;
 PERFORM pg_temp.assert357v3(public.arcade_drop357_step(actor,run_id_i)->'projection'->'roundScores'=v->'roundScores','finished refresh preserves summaries');
 PERFORM pg_temp.assert357v3(private.drop357_valid_dispatch(s) AND NOT private.drop357_valid_dispatch(jsonb_set(s,'{score}','9999999')),'validated final sum');
 PERFORM pg_temp.assert357v3(NOT private.drop357_valid_dispatch(jsonb_set(s,'{rounds,0,score}','9999999')),'historical round tampering rejected');
 run:=public.arcade_start(actor,gen_random_uuid(),'357-drop');
 PERFORM pg_temp.assert357v3(run->>'id'<>run_id_i::text,'successor');
 PERFORM pg_temp.assert357v3(public.arcade_drop357_step(actor,run_id_i,(before_v->>'revision')::bigint,before_v->>'roundId',request,'place',ARRAY[2,6])->>'outcome'='duplicate','late final replay');
 run_id_i:=(run->>'id')::uuid;v:=public.arcade_drop357_step(actor,run_id_i)->'projection';
 v:=public.arcade_drop357_step(actor,run_id_i,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}')->'projection';
 PERFORM pg_temp.assert357v3(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=run_id_i),'abandon unranked');
 -- Cold recovery traverses every intro, timeout and result hold without a client.
 FOR i IN 1..2 LOOP
  run:=public.arcade_start(CASE WHEN i=1 THEN actor ELSE stranger END,gen_random_uuid(),'357-drop');run_id_i:=(run->>'id')::uuid;
  UPDATE private.arcade_runs SET state=private.drop357_v3_deal(jsonb_build_object('runId',run_id_i,'userId',user_id,'status','active','config',config),floor(extract(epoch FROM clock_timestamp())*1000)::bigint-400000,1) WHERE arcade_runs.id=run_id_i;
  v:=public.arcade_drop357_step(NULL,run_id_i,p_token=>'35735735-7357-4357-8357-357357357357')->'projection';
  PERFORM pg_temp.assert357v3(v->>'round'='3' AND v->>'status'='completed' AND v->>'score'='0','zero-client three-round timeout');
  last_revision:=(v->>'revision')::bigint;PERFORM public.arcade_drop357_step(NULL,run_id_i,p_token=>'35735735-7357-4357-8357-357357357357');
  PERFORM pg_temp.assert357v3((SELECT revision FROM private.arcade_runs WHERE arcade_runs.id=run_id_i)=last_revision AND (SELECT count(*) FROM private.arcade_results WHERE run_id=run_id_i)=1,'recovery replay');
 END LOOP;
 reply:=public.arcade_leaderboard(actor,'357-drop','all');
 PERFORM pg_temp.assert357v3(reply->>'ruleset'='357-drop/3' AND (SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(reply->'rows')x WHERE x->>'score'='0')=1,'version separation and ties');
 PERFORM pg_temp.assert357v3(NOT EXISTS(SELECT FROM v3_write_baseline b JOIN pg_stat_xact_user_tables t USING(relid) WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>b.n),'no multiplayer or financial writes');
END $$;
DO $$
DECLARE s jsonb;before_s jsonb;at_ms bigint:=1000000;actor uuid:=gen_random_uuid();run jsonb;old_id uuid;v jsonb;i integer;
BEGIN
 s:=private.drop357_v3_deal(jsonb_build_object('runId',gen_random_uuid(),'status','active','config',(SELECT config FROM private.arcade_rulesets WHERE id='357-drop/3')),at_ms,1);
 s:=private.drop357_v3_advance(s,at_ms+2500);
 -- Later stages first; distinct 2,4,6 is a zero-score three-card hand.
 FOR i IN 1..7 LOOP
  s:=s||jsonb_build_object('current',(ARRAY[9,22,35,48,0,15,30])[i]);
  s:=private.drop357_v3_action(s,'place',CASE WHEN i<=2 THEN ARRAY[1,i+2] WHEN i<=4 THEN ARRAY[2,i+2] ELSE ARRAY[0,i-5] END,at_ms+2500+i);
  IF i<7 THEN PERFORM pg_temp.assert357v3(s->'laneResults'='[null,null,null]'::jsonb,'prefill waits for inherited cards');END IF;
 END LOOP;
 PERFORM pg_temp.assert357v3(s#>>'{laneResults,0,score}'='0' AND s#>>'{result,allBonus}'='0' AND s#>>'{result,reason}'='filled','zero score carries; no all-lanes bonus');
 PERFORM pg_temp.assert357v3(s->'lanes'->0='[0,15,30]'::jsonb AND s->'lanes'->1='[0,15,30,9,22]'::jsonb AND s->'lanes'->2='[0,15,30,9,22,35,48]'::jsonb,'printed inheritance');
 PERFORM pg_temp.assert357v3((SELECT count(DISTINCT x->>'completedAt') FROM jsonb_array_elements(s->'laneResults')x)=1,'one final placement resolves all stages');
 PERFORM pg_temp.assert357v3(private.drop357_v3_valid_board(s->'rounds'->0),'cascade proof');
 PERFORM pg_temp.assert357v3(private.drop357_lane(ARRAY[1,10,23],3)->>'natural'='false' AND private.drop357_lane(ARRAY[1,10,23,36,49],5)->>'natural'='true','printed 3 loses wildcard and natural reevaluates');
 -- Every pass, including five at the last open slot, stays legal; exposure bound 12.
 s:=private.drop357_v3_deal(jsonb_build_object('runId',gen_random_uuid(),'status','active','config',(SELECT config FROM private.arcade_rulesets WHERE id='357-drop/3')),at_ms,1);
 s:=private.drop357_v3_advance(s,at_ms+2500);
 FOR i IN 0..5 LOOP s:=private.drop357_v3_action(s,'place',CASE WHEN i<3 THEN ARRAY[0,i] WHEN i<5 THEN ARRAY[1,i] ELSE ARRAY[2,5] END,at_ms+2501+i);END LOOP;
 FOR i IN 1..5 LOOP s:=private.drop357_v3_action(s,'pass','{}',at_ms+2510+i);END LOOP;
 PERFORM pg_temp.assert357v3(s->>'cursor'='12' AND s->>'passesLeft'='0','12 exposed cards');
 s:=private.drop357_v3_action(s,'place',ARRAY[2,6],at_ms+2520);
 PERFORM pg_temp.assert357v3(s->>'placements'='7' AND private.drop357_v3_valid_board(s->'rounds'->0),'seven unique placements');
 PERFORM pg_temp.assert357v3(NOT private.drop357_v3_valid_board(jsonb_set(s->'rounds'->0,'{lanes,1,0}','51')),'inheritance forgery rejected');
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'357 switch proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 PERFORM private.drop357_select_ruleset(true);run:=public.arcade_start(actor,gen_random_uuid(),'357-drop');old_id:=(run->>'id')::uuid;
 PERFORM private.drop357_select_ruleset(false);
 PERFORM pg_temp.assert357v3(public.arcade_start(actor,gen_random_uuid(),'357-drop')->>'ruleset'='357-drop/3','active game pinned across switch');
 v:=public.arcade_drop357_step(actor,old_id)->'projection';PERFORM public.arcade_drop357_step(actor,old_id,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}');
 run:=public.arcade_start(actor,gen_random_uuid(),'357-drop');v:=public.arcade_drop357_step(actor,(run->>'id')::uuid)->'projection';
 PERFORM pg_temp.assert357v3(v->>'ruleset'='357-drop/2' AND v->>'passesLeft'='3' AND v->'lanes'='[[],[],[]]'::jsonb,'new original after switch');
 PERFORM pg_temp.assert357v3(private.arcade_score_group('357-drop','357-drop/3')<>private.arcade_score_group('357-drop','357-drop/2'),'separate leaderboard score groups');
END $$;
SELECT 'PASS: carry-forward rollback, cascade, wild reevaluation, switch and isolation' result;
ROLLBACK;
