-- Execute inside BEGIN / ROLLBACK, after the candidate or against installation.
DO $proof$
DECLARE normal_owner uuid:=gen_random_uuid();apple_owner uuid:=gen_random_uuid();
 off_owner uuid:=gen_random_uuid();arcade_owner uuid:=gen_random_uuid();
 normal jsonb;apple jsonb;other jsonb;dealt jsonb;pool_before jsonb;role_name text;
BEGIN
 UPDATE private.five_alive_apple_harness SET enabled=false WHERE singleton;
 normal:=private.five_alive_allocate('async',normal_owner,'esdb-five-alive/3');
 IF (SELECT count(DISTINCT a->>'word') FROM jsonb_array_elements(normal) a)<>3 THEN RAISE EXCEPTION 'proof:normal_uniqueness'; END IF;
 UPDATE private.five_alive_apple_harness SET enabled=true WHERE singleton;
 SELECT to_jsonb(p) INTO pool_before FROM private.five_alive_pool p WHERE version='esdb-five-alive/3';
 dealt:=private.five_alive_async_deal(apple_owner,gen_random_uuid(),gen_random_uuid(),'esdb-five-alive/3');
 apple:=dealt#>'{fiveAlive,answers}';
 IF jsonb_array_length(apple)<>3 OR EXISTS(SELECT FROM jsonb_array_elements(apple) a WHERE a->>'word'<>'APPLE' OR (a->>'difficulty')::int<>4) THEN RAISE EXCEPTION 'proof:all_apple_existing_tier'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(dealt#>'{fiveAlive,rounds}') player, jsonb_array_elements(player) r WHERE r->>'answer'<>'APPLE' OR r->'guesses'<>'[]'::jsonb OR r->>'completed'<>'false') THEN RAISE EXCEPTION 'proof:both_player_rounds'; END IF;
 IF pool_before IS DISTINCT FROM (SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/3') THEN RAISE EXCEPTION 'proof:normal_pool_consumed'; END IF;
 IF EXISTS(SELECT FROM private.five_alive_allocations WHERE owner_id=apple_owner) THEN RAISE EXCEPTION 'proof:normal_allocation_changed'; END IF;
 IF private.five_alive_allocate('async',apple_owner,'esdb-five-alive/3')<>apple THEN RAISE EXCEPTION 'proof:duplicate'; END IF;
 IF private.five_alive_allocate('async',normal_owner,'esdb-five-alive/3')<>normal THEN RAISE EXCEPTION 'proof:historical_replay'; END IF;
 other:=private.five_alive_allocate('arcade',arcade_owner,'esdb-five-alive/3');
 IF (SELECT count(DISTINCT a->>'word') FROM jsonb_array_elements(other) a)<>3 THEN RAISE EXCEPTION 'proof:arcade_changed'; END IF;
 UPDATE private.five_alive_apple_harness SET enabled=false WHERE singleton;
 IF private.five_alive_allocate('async',apple_owner,'esdb-five-alive/3')<>apple THEN RAISE EXCEPTION 'proof:late_replay_after_disable'; END IF;
 other:=private.five_alive_allocate('async',off_owner,'esdb-five-alive/3');
 IF (SELECT count(DISTINCT a->>'word') FROM jsonb_array_elements(other) a)<>3 THEN RAISE EXCEPTION 'proof:disable_new_match'; END IF;
 BEGIN
  PERFORM private.five_alive_allocate('async',apple_owner,'esdb-five-alive/2');
  RAISE EXCEPTION 'proof:version_conflict_accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'five_alive:allocation_conflict' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM private.five_alive_allocate('invalid',gen_random_uuid(),'esdb-five-alive/3');
  RAISE EXCEPTION 'proof:invalid_mode_accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'five_alive:invalid_allocation' THEN RAISE; END IF;
 END;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(role_name,'private.five_alive_apple_harness','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege(role_name,'private.five_alive_apple_allocations','SELECT,INSERT,UPDATE,DELETE')
   OR has_function_privilege(role_name,'private.five_alive_allocate(text,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'proof:public_harness_access %',role_name; END IF;
 END LOOP;
END $proof$;
