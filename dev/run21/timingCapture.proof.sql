-- Always run inside BEGIN / ROLLBACK, after installing the candidate definitions.
SELECT set_config('proof.owner',gen_random_uuid()::text,true);
SELECT set_config('proof.other',gen_random_uuid()::text,true);
INSERT INTO auth.users(id) VALUES(current_setting('proof.owner')::uuid),(current_setting('proof.other')::uuid);
INSERT INTO private.run21_timing_grants VALUES(current_setting('proof.owner')::uuid,now()-interval '1 minute',now()+interval '1 hour',now()+interval '7 days 1 hour');
SELECT set_config('request.jwt.claim.sub',current_setting('proof.owner'),true);
SET LOCAL ROLE authenticated;
DO $$DECLARE id uuid=gen_random_uuid(); sample jsonb; BEGIN
 IF public.run21_timing_grant() IS NULL THEN RAISE EXCEPTION 'grant_missing'; END IF;
 sample=jsonb_build_array(jsonb_build_array(1,extract(epoch FROM clock_timestamp())*1000,'intent','01234567',3,null,jsonb_build_object('total',10)));
 IF NOT public.run21_store_timing(id,'arcade',sample) OR NOT public.run21_store_timing(id,'arcade',sample) THEN RAISE EXCEPTION 'write_replay_failed'; END IF;
 FOR i IN 1..10 LOOP PERFORM public.run21_store_timing(gen_random_uuid(),'multiplayer',sample); END LOOP;
 BEGIN PERFORM public.run21_store_timing(id,'arcade',jsonb_build_array(jsonb_build_array(1,extract(epoch FROM clock_timestamp())*1000,'secret card','01234567',1,null,null))); RAISE EXCEPTION 'accepted_secret'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='accepted_secret' THEN RAISE; END IF; END;
 BEGIN PERFORM public.run21_store_timing(id,'arcade',(SELECT jsonb_agg(sample->0) FROM generate_series(1,2401))); RAISE EXCEPTION 'accepted_overflow'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='accepted_overflow' THEN RAISE; END IF; END;
 BEGIN PERFORM public.run21_store_timing(id,'arcade','[[1,1,null,null,1,null,null]]'); RAISE EXCEPTION 'accepted_null'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='accepted_null' THEN RAISE; END IF; END;
 BEGIN PERFORM * FROM private.run21_timing_captures; RAISE EXCEPTION 'private_read_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$BEGIN IF (SELECT count(*) FROM private.run21_timing_captures WHERE user_id=current_setting('proof.owner')::uuid)<>8 THEN RAISE EXCEPTION 'unbounded_captures'; END IF; END $$;
SELECT set_config('proof.capture',gen_random_uuid()::text,true);
SET LOCAL ROLE authenticated;
SELECT public.run21_store_timing(current_setting('proof.capture')::uuid,'arcade',jsonb_build_array(jsonb_build_array(3,extract(epoch FROM clock_timestamp())*1000,'intent','01234567',3,null,null)));
SELECT public.run21_store_timing(current_setting('proof.capture')::uuid,'arcade',jsonb_build_array(jsonb_build_array(1,extract(epoch FROM clock_timestamp())*1000,'intent','01234567',1,null,null)));
RESET ROLE;
DO $$BEGIN IF (SELECT samples->0->>0 FROM private.run21_timing_captures WHERE user_id=current_setting('proof.owner')::uuid AND capture_id=current_setting('proof.capture')::uuid)<>'3' THEN RAISE EXCEPTION 'late_upload_regressed_evidence'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('proof.other'),true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 IF public.run21_timing_grant() IS NOT NULL OR public.run21_store_timing(gen_random_uuid(),'arcade','[]') THEN RAISE EXCEPTION 'other_account_admitted'; END IF;
END $$;
RESET ROLE;
UPDATE private.run21_timing_grants SET armed_at=now()-interval '2 hours',expires_at=now()-interval '1 hour',retain_until=now()+interval '6 days 23 hours' WHERE user_id=current_setting('proof.owner')::uuid;
SELECT set_config('request.jwt.claim.sub',current_setting('proof.owner'),true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 IF public.run21_timing_grant() IS NOT NULL OR public.run21_store_timing(gen_random_uuid(),'multiplayer','[]') THEN RAISE EXCEPTION 'expired_admitted'; END IF;
END $$;
RESET ROLE;
DO $$BEGIN
 IF has_function_privilege('anon','public.run21_timing_grant()','execute') OR has_function_privilege('anon','public.run21_store_timing(uuid,text,jsonb)','execute') THEN RAISE EXCEPTION 'anonymous_admitted'; END IF;
END $$;
UPDATE private.run21_timing_grants SET armed_at=now()-interval '9 days',expires_at=now()-interval '8 days',retain_until=now()-interval '1 day' WHERE user_id=current_setting('proof.owner')::uuid;
SELECT private.purge_run21_timing();
DO $$BEGIN IF EXISTS(SELECT FROM private.run21_timing_captures WHERE user_id=current_setting('proof.owner')::uuid) THEN RAISE EXCEPTION 'retention_failed'; END IF; END $$;
SELECT 'authorization, anonymous denial, replay/late replay, payload validation, overflow, eight-window cap, both modes, expiry, retention: PASS' AS proof;
