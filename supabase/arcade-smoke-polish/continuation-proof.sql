BEGIN;
SET LOCAL statement_timeout='25s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.polish_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Arcade polish: %',label;END IF;END$$;
DO $$
DECLARE actor uuid:=gen_random_uuid();rid uuid;v jsonb;s jsonb;old_v jsonb;at_ms bigint:=floor(extract(epoch from clock_timestamp())*1000);tok uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'Polish proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=null,token=tok,claimed=true,expires_at=clock_timestamp()+interval '1 minute';
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='ship-cap-voyage/1';
 rid:=(public.arcade_start(actor,gen_random_uuid(),'ship-cap-voyage')->>'id')::uuid;
 v:=public.arcade_ship_cap_voyage_step(actor,rid)->'projection';
 SELECT state INTO s FROM private.arcade_runs WHERE id=rid;
 s:=private.ship_cap_voyage_finish(s,at_ms);
 UPDATE private.arcade_runs SET state=s WHERE id=rid;
 v:=public.arcade_ship_cap_voyage_step(actor,rid)->'projection';
 PERFORM pg_temp.polish_check(v->>'phase'='summary','score hold does not advance early');old_v:=v;
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{result,completedAt}',to_jsonb(at_ms-8001)) WHERE id=rid;
 v:=public.arcade_ship_cap_voyage_step(NULL,rid,p_token=>tok)->'projection';
 PERFORM pg_temp.polish_check(v->>'round'='2' AND v->>'roll'='0' AND v->'dice'='[]'::jsonb AND v->>'dueAt' IS NULL,'zero-client successor waits for manual Roll');
 PERFORM pg_temp.polish_check(public.arcade_ship_cap_voyage_step(actor,rid)->'projection'->>'round'='2','duplicate recovery does not skip');
 PERFORM pg_temp.polish_check(public.arcade_ship_cap_voyage_step(actor,rid,(old_v->>'revision')::bigint,old_v->>'roundId',gen_random_uuid(),'next_round','{}')->>'outcome'='stale','old round cannot skip successor');
 -- Both rabbit cards become public only in a committed Fold receipt.
 s:=private.chucky_showdown_deal_v2(jsonb_build_object('runId',gen_random_uuid(),'config',jsonb_build_object('maxFolds',3,'maxCracks',3),'round',0,'hand',0,'status','active','score',0,'results','[]'::jsonb),true,at_ms);
 s:=s||jsonb_build_object('phase','fold_stay');old_v:=s;
 v:=private.chucky_showdown_act_v2(s,'fold',null,at_ms);
 PERFORM pg_temp.polish_check(jsonb_array_length(private.chucky_showdown_scene_v2(old_v)->'community')=2,'unfolded hidden board stays private');
 PERFORM pg_temp.polish_check(v#>'{lastFold,community}'=old_v->'community' AND jsonb_array_length(v#>'{lastFold,community}')=4,'committed fold reveals both original rabbit cards');
 PERFORM pg_temp.polish_check(v->>'hand'='2' AND v->>'risk'='0','rabbit is presentation only');
 PERFORM pg_temp.polish_check(private.drop357_lane(ARRAY[9,22,38],3)->>'score'='150','JJA example');
 PERFORM pg_temp.polish_check(private.drop357_lane(ARRAY[9,22,37],3)->>'score'='148','JJK example');
 PERFORM pg_temp.polish_check(private.drop357_lane(ARRAY[9,22,27],3)->>'score'='480','JJ3 example');
 PERFORM pg_temp.polish_check(private.drop357_lane(ARRAY[12,25,38,11,24],5)->>'score'='2224','natural aces full');
 PERFORM pg_temp.polish_check(private.drop357_lane(ARRAY[12,25,29,11,24],5)->>'score'='1853','wild aces full');
END$$;
ROLLBACK;
