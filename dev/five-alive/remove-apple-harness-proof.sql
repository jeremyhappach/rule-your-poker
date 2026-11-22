-- Run after the harness removal migration inside a rollback transaction.
DO $proof$
DECLARE normal jsonb; replay jsonb; dealt jsonb; arcade jsonb; pool_after jsonb;
 normal_id uuid:=gen_random_uuid(); arcade_id uuid:=gen_random_uuid(); r text; who uuid; target uuid;
BEGIN
 IF md5(pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure))<>'e87e877680c4c20e2de9a33bf22984b0'
  THEN RAISE EXCEPTION 'proof:original_allocator_not_restored'; END IF;
 IF to_regclass('private.five_alive_apple_harness') IS NOT NULL OR to_regclass('private.five_alive_apple_allocations') IS NOT NULL
  THEN RAISE EXCEPTION 'proof:harness_still_installed'; END IF;
 dealt:=private.five_alive_async_deal(normal_id,gen_random_uuid(),gen_random_uuid(),'esdb-five-alive/3');
 normal:=dealt#>'{fiveAlive,answers}';
 IF (SELECT count(DISTINCT a->>'word') FROM jsonb_array_elements(normal) a)<>3
  OR (SELECT count(*) FROM private.five_alive_allocations WHERE mode='async' AND owner_id=normal_id)<>3
  OR (SELECT count(*) FROM private.five_alive_allocation_difficulty WHERE mode='async' AND owner_id=normal_id)<>3
  THEN RAISE EXCEPTION 'proof:normal_allocation_or_difficulty'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(dealt#>'{fiveAlive,rounds}') p,jsonb_array_elements(p) r)<>6
  OR dealt#>'{fiveAlive,rounds,0}'<>dealt#>'{fiveAlive,rounds,1}'
  THEN RAISE EXCEPTION 'proof:both_players_same_deal'; END IF;
 SELECT to_jsonb(p) INTO pool_after FROM private.five_alive_pool p WHERE version='esdb-five-alive/3';
 replay:=private.five_alive_allocate('async',normal_id,'esdb-five-alive/3');
 IF replay<>normal OR pool_after<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/3')
  THEN RAISE EXCEPTION 'proof:replay_consumed_pool'; END IF;
 arcade:=private.five_alive_allocate('arcade',arcade_id,'esdb-five-alive/3');
 IF (SELECT count(DISTINCT a->>'word') FROM jsonb_array_elements(arcade) a)<>3
  THEN RAISE EXCEPTION 'proof:arcade_changed'; END IF;
 IF private.five_alive_allocate('async',normal_id,'esdb-five-alive/3')<>normal
  THEN RAISE EXCEPTION 'proof:late_replay'; END IF;
 BEGIN
  PERFORM private.five_alive_allocate('async',normal_id,'esdb-five-alive/2');
  RAISE EXCEPTION 'proof:version_conflict_accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'five_alive:allocation_conflict' THEN RAISE; END IF; END;
 BEGIN
  PERFORM private.five_alive_allocate('invalid',normal_id,'esdb-five-alive/3');
  RAISE EXCEPTION 'proof:invalid_mode_accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'five_alive:invalid_allocation' THEN RAISE; END IF; END;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'private.five_alive_allocate(text,uuid,text)','EXECUTE')
   THEN RAISE EXCEPTION 'proof:allocator_api_access %',r; END IF;
 END LOOP;
 FOREACH who IN ARRAY ARRAY['d7dc1928-3727-4351-b0ff-0e80c81c2953','e13e2dd9-6b38-4073-a313-2286877af40c','fb835d1f-db2f-4de4-84e2-ce0074512e46']::uuid[] LOOP
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  IF EXISTS(SELECT FROM jsonb_array_elements(public.delayed_list()) item JOIN apple_cleanup_targets t ON item->>'id'=t.id::text)
   THEN RAISE EXCEPTION 'proof:removed_match_in_history'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
 FOR target IN SELECT id FROM apple_cleanup_targets LOOP
  BEGIN
   PERFORM public.delayed_home(target);
   RAISE EXCEPTION 'proof:deleted_home_accessible';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
   PERFORM private.delayed_finalize(target);
   RAISE EXCEPTION 'proof:deleted_match_settleable';
  EXCEPTION WHEN no_data_found THEN NULL; END;
 END LOOP;
 IF EXISTS(SELECT FROM public.player_transactions p JOIN apple_cleanup_targets t ON t.id=p.source_game_id)
  THEN RAISE EXCEPTION 'proof:stale_financial_write'; END IF;
END $proof$;
