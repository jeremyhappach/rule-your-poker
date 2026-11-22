-- Owner-authorized APPLE harness removal and exact, unsettled match cleanup.
-- Execute atomically. This never changes financial authority, balances or ledger.
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(731907241);

CREATE TEMP TABLE apple_cleanup_targets(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO apple_cleanup_targets VALUES
 ('09512245-5592-4fdc-aa14-462049666051'),
 ('666767c9-ad6b-4030-8e53-ee8240c405a3'),
 ('ad6d7d19-640e-4561-ae57-1ba51fde1d6d');
CREATE TEMP TABLE apple_cleanup_children(id uuid PRIMARY KEY,match_id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE apple_cleanup_report(data jsonb NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.apple_preserve_fingerprint() RETURNS jsonb
LANGUAGE plpgsql AS $fingerprint$
DECLARE table_i text; digest_i text; result jsonb:='{}';
BEGIN
 FOREACH table_i IN ARRAY ARRAY[
  'public.player_transactions','public.gameplay_transfer_batches','public.gameplay_transfer_pending_changes',
  'public.players','public.games','public.dealer_games','public.game_results','public.session_player_snapshots',
  'private.five_alive_pool','private.five_alive_shuffle','private.five_alive_allocations',
  'private.five_alive_allocation_difficulty','private.delayed_requests'
 ] LOOP
  EXECUTE format($query$SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM (SELECT md5(to_jsonb(t)::text) h FROM %s t) s$query$,table_i)
   INTO digest_i;
  result:=result||jsonb_build_object(table_i,digest_i);
 END LOOP;
 SELECT result||jsonb_build_object('other_matches',md5(coalesce(string_agg(md5(to_jsonb(m)::text),'' ORDER BY m.id),'')))
 INTO result FROM private.delayed_matches m WHERE NOT EXISTS(SELECT FROM apple_cleanup_targets t WHERE t.id=m.id);
 SELECT result||jsonb_build_object('other_children',md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' ORDER BY c.id),'')))
 INTO result FROM private.delayed_children c WHERE NOT EXISTS(SELECT FROM apple_cleanup_targets t WHERE t.id=c.match_id);
 SELECT result||jsonb_build_object('other_commands',md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' ORDER BY c.actor,c.request_id),'')))
 INTO result FROM private.delayed_commands c WHERE NOT EXISTS(SELECT FROM apple_cleanup_children t WHERE t.id=c.child_id);
 RETURN result;
END $fingerprint$;

DO $cleanup$
DECLARE definition text; before_i jsonb; matches_i jsonb; commands_i bigint; balances_i jsonb;
BEGIN
 PERFORM 1 FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id ORDER BY m.id FOR UPDATE OF m;
 PERFORM 1 FROM private.delayed_children c JOIN apple_cleanup_targets t ON t.id=c.match_id ORDER BY c.id FOR UPDATE OF c;
 PERFORM 1 FROM private.five_alive_pool ORDER BY version FOR UPDATE;
 IF NOT EXISTS(SELECT FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id)
  AND to_regclass('private.five_alive_apple_harness') IS NULL
  AND to_regclass('private.five_alive_apple_allocations') IS NULL THEN
  IF (SELECT count(*) FROM private.delayed_removals r JOIN apple_cleanup_targets t ON t.id=r.match_id)<>3 THEN
   RAISE EXCEPTION 'apple_cleanup:missing_audit'; END IF;
  INSERT INTO apple_cleanup_report VALUES(jsonb_build_object('alreadyRemoved',true));
  RETURN;
 END IF;
 IF (SELECT count(*) FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id)<>3
  OR (SELECT count(*) FROM private.five_alive_apple_allocations)<>4
  OR (SELECT count(*) FROM private.delayed_children c JOIN apple_cleanup_targets t ON t.id=c.match_id)<>4
  OR EXISTS(SELECT FROM private.five_alive_apple_allocations a LEFT JOIN private.delayed_children c ON c.id=a.owner_id
    WHERE c.id IS NULL OR NOT EXISTS(SELECT FROM apple_cleanup_targets t WHERE t.id=c.match_id)
      OR c.game_type<>'five-alive' OR c.terminal OR a.answers<>c.state#>'{fiveAlive,answers}'
      OR a.answers<>'[{"word":"APPLE","difficulty":4},{"word":"APPLE","difficulty":4},{"word":"APPLE","difficulty":4}]'::jsonb)
  OR EXISTS(SELECT FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id
   WHERE m.organizer<>'d7dc1928-3727-4351-b0ff-0e80c81c2953' OR m.settled_at IS NOT NULL
    OR (m.id='666767c9-ad6b-4030-8e53-ee8240c405a3' AND (NOT m.real_money OR m.opponent<>'e13e2dd9-6b38-4073-a313-2286877af40c' OR m.status<>'active'))
    OR (m.id<>'666767c9-ad6b-4030-8e53-ee8240c405a3' AND (m.real_money OR m.opponent<>'fb835d1f-db2f-4de4-84e2-ce0074512e46' OR m.status<>'cancelled')))
 THEN RAISE EXCEPTION 'apple_cleanup:target_precondition_changed'; END IF;
 -- Any settlement, including a corrected/reopened financial identity, aborts.
 IF EXISTS(SELECT FROM private.delayed_current_settlements s JOIN apple_cleanup_targets t ON t.id=s.match_id)
  OR EXISTS(SELECT FROM private.delayed_corrections s JOIN apple_cleanup_targets t ON t.id=s.match_id)
  OR EXISTS(SELECT FROM private.delayed_current_outcomes s JOIN apple_cleanup_targets t ON t.id=s.match_id)
  OR EXISTS(SELECT FROM private.delayed_review_events s JOIN apple_cleanup_targets t ON t.id=s.match_id)
  OR EXISTS(SELECT FROM public.games s JOIN apple_cleanup_targets t ON t.id=s.id)
  OR EXISTS(SELECT FROM public.game_results s JOIN apple_cleanup_targets t ON t.id=s.game_id)
  OR EXISTS(SELECT FROM public.player_transactions s JOIN apple_cleanup_targets t ON t.id=s.source_game_id)
  OR EXISTS(SELECT FROM public.gameplay_transfer_batches s JOIN apple_cleanup_targets t ON t.id=s.game_id)
  OR EXISTS(SELECT FROM public.gameplay_transfer_pending_changes s JOIN apple_cleanup_targets t ON t.id=s.game_id)
  OR EXISTS(SELECT FROM public.session_player_snapshots s JOIN apple_cleanup_targets t ON t.id=s.game_id)
 THEN RAISE EXCEPTION 'apple_cleanup:result_or_financial_record_requires_review'; END IF;
 INSERT INTO apple_cleanup_children SELECT c.id,c.match_id FROM private.delayed_children c JOIN apple_cleanup_targets t ON t.id=c.match_id;
 IF EXISTS(SELECT FROM private.delayed_word_commands c JOIN apple_cleanup_children t ON t.id=c.child_id)
 THEN RAISE EXCEPTION 'apple_cleanup:unexpected_word_commands'; END IF;
 before_i:=pg_temp.apple_preserve_fingerprint();
 SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('children',(SELECT jsonb_agg(c.id ORDER BY c.ordinal) FROM private.delayed_children c WHERE c.match_id=m.id)) ORDER BY m.id)
 INTO matches_i FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id;
 SELECT jsonb_object_agg(profile_id::text,balance::text) INTO balances_i FROM (
  SELECT p.id profile_id,coalesce(sum(t.amount),0) balance FROM public.profiles p
  LEFT JOIN public.player_transactions t ON t.profile_id=p.id
  WHERE p.id IN('d7dc1928-3727-4351-b0ff-0e80c81c2953','e13e2dd9-6b38-4073-a313-2286877af40c','fb835d1f-db2f-4de4-84e2-ce0074512e46') GROUP BY p.id
 ) balances;
 definition:=pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure);
 IF md5(definition)<>'2bf80664daae380179df39d7fdc799e7' THEN RAISE EXCEPTION 'apple_cleanup:allocator_source_changed'; END IF;
 EXECUTE $restored$CREATE OR REPLACE FUNCTION private.five_alive_allocate(p_mode text, p_owner uuid, p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE pool private.five_alive_pool; n integer; chosen text[]:=ARRAY[]::text[]; picked text; result jsonb; existing integer; relative_version private.five_alive_difficulty_versions; tier_i smallint;
BEGIN
 IF p_mode NOT IN ('arcade','async') OR p_mode IS NULL OR p_owner IS NULL OR p_version IS NULL THEN
  RAISE EXCEPTION 'five_alive:invalid_allocation';
 END IF;
 -- The global pool lock is also the replay/concurrency lock for every owner.
 SELECT * INTO STRICT pool FROM private.five_alive_pool WHERE version=p_version FOR UPDATE;
 SELECT count(*) INTO existing FROM private.five_alive_allocations WHERE mode=p_mode AND owner_id=p_owner;
 IF existing NOT IN (0,3) OR EXISTS(SELECT FROM private.five_alive_allocations WHERE mode=p_mode AND owner_id=p_owner AND version<>p_version) THEN
  RAISE EXCEPTION 'five_alive:allocation_conflict';
 END IF;
 IF existing=0 THEN
  -- Relative difficulty snapshots: selection and its global pool are unchanged.
  SELECT d.* INTO relative_version FROM private.five_alive_difficulty_current c
   JOIN private.five_alive_difficulty_versions d ON d.version=c.difficulty_version AND d.pool_version=c.pool_version
   WHERE c.pool_version=p_version;
  SELECT count(*) INTO n FROM private.five_alive_answers WHERE version=p_version;
  IF n<3 THEN RAISE EXCEPTION 'five_alive:pool_too_small'; END IF;
  FOR r IN 1..3 LOOP
   IF pool.epoch=0 OR pool.cursor>=n THEN
    pool.epoch:=pool.epoch+1;pool.cursor:=0;
    -- pg_catalog.gen_random_uuid uses cryptographically strong randomness.
    -- Move words already selected for this game (and the last prior word) to
    -- the end on rollover, preventing cross-boundary duplicate game answers.
    INSERT INTO private.five_alive_shuffle(version,epoch,position,word)
    SELECT p_version,pool.epoch,row_number() OVER (ORDER BY (a.word=ANY(chosen) OR a.word=pool.last_word) NULLS FIRST,gen_random_uuid())::integer,a.word
    FROM private.five_alive_answers a WHERE a.version=p_version;
   END IF;
   pool.cursor:=pool.cursor+1;
   SELECT word INTO STRICT picked FROM private.five_alive_shuffle
    WHERE version=p_version AND epoch=pool.epoch AND position=pool.cursor;
   IF picked=ANY(chosen) THEN RAISE EXCEPTION 'five_alive:duplicate_answer'; END IF;
   chosen:=array_append(chosen,picked);pool.last_word:=picked;
   INSERT INTO private.five_alive_allocations(mode,owner_id,version,round,word)
    VALUES(p_mode,p_owner,p_version,r,picked);
   IF relative_version.version IS NOT NULL THEN
    tier_i:=(relative_version.tiers->>picked)::smallint;
    IF tier_i IS NULL OR tier_i NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'five_alive:missing_difficulty'; END IF;
    INSERT INTO private.five_alive_allocation_difficulty(mode,owner_id,round,difficulty_version,difficulty,multiplier_percent)
     VALUES(p_mode,p_owner,r,relative_version.version,tier_i,relative_version.multipliers[tier_i]);
   END IF;
  END LOOP;
  UPDATE private.five_alive_pool SET epoch=pool.epoch,cursor=pool.cursor,last_word=pool.last_word WHERE version=p_version;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('word',a.word,'difficulty',coalesce(d.difficulty,w.difficulty)) ORDER BY a.round) INTO result
 FROM private.five_alive_allocations a JOIN private.five_alive_answers w USING(version,word)
 LEFT JOIN private.five_alive_allocation_difficulty d ON d.mode=a.mode AND d.owner_id=a.owner_id AND d.round=a.round
 WHERE a.mode=p_mode AND a.owner_id=p_owner;
 RETURN result;
END $function$
$restored$;
 REVOKE ALL ON FUNCTION private.five_alive_allocate(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

 -- Preserve immutable request/removal receipts as audit and replay tombstones.
 INSERT INTO private.delayed_removals(match_id,actor,request_id,prior_status)
 SELECT m.id,m.organizer,'e6a00bda-2844-4c8a-8109-2ed5b07e18db'::uuid,m.status
 FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id ON CONFLICT(match_id) DO NOTHING;
 INSERT INTO public.delayed_match_updates(match_id,user_id,revision)
 SELECT m.id,p,m.revision+1 FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id,
 LATERAL unnest(ARRAY[m.organizer,m.opponent]) p
 ON CONFLICT(match_id,user_id) DO UPDATE SET revision=EXCLUDED.revision;

 DELETE FROM private.push_deliveries d USING private.push_events e,apple_cleanup_targets t WHERE d.event_id=e.id AND e.match_id=t.id;
 DELETE FROM private.push_events e USING apple_cleanup_targets t WHERE e.match_id=t.id;
 DELETE FROM private.push_episodes e USING apple_cleanup_targets t WHERE e.match_id=t.id;
 DELETE FROM private.push_match_preferences e USING apple_cleanup_targets t WHERE e.match_id=t.id;
 DELETE FROM private.push_presence e USING apple_cleanup_targets t WHERE e.match_id=t.id;
 DELETE FROM public.platform_notifications e USING apple_cleanup_targets t WHERE e.match_id=t.id;

 -- The only bypass is this nonfinancial command guard, under ACCESS EXCLUSIVE
 -- table lock until commit. Other sessions never observe it disabled.
 -- All financial/result/settlement guards remain enabled throughout.
 ALTER TABLE private.delayed_commands DISABLE TRIGGER delayed_commands_immutable;
 DELETE FROM private.delayed_commands c USING apple_cleanup_children t WHERE c.child_id=t.id;
 GET DIAGNOSTICS commands_i=ROW_COUNT;
 ALTER TABLE private.delayed_commands ENABLE TRIGGER delayed_commands_immutable;
 DELETE FROM private.delayed_acceptance_retired r USING apple_cleanup_targets t WHERE r.match_id=t.id;
 DELETE FROM private.delayed_children c USING apple_cleanup_targets t WHERE c.match_id=t.id;
 DELETE FROM private.delayed_matches m USING apple_cleanup_targets t WHERE m.id=t.id;
 DROP TABLE private.five_alive_apple_allocations;
 DROP TABLE private.five_alive_apple_harness;

 IF pg_temp.apple_preserve_fingerprint() IS DISTINCT FROM before_i THEN
  RAISE EXCEPTION 'apple_cleanup:preserved_data_changed';
 END IF;
 IF EXISTS(SELECT FROM private.delayed_matches m JOIN apple_cleanup_targets t ON t.id=m.id)
  OR EXISTS(SELECT FROM private.delayed_children c JOIN apple_cleanup_targets t ON t.id=c.match_id)
  OR EXISTS(SELECT FROM private.delayed_commands c JOIN apple_cleanup_children t ON t.id=c.child_id)
  OR EXISTS(SELECT FROM pg_trigger WHERE tgrelid='private.delayed_commands'::regclass AND tgname='delayed_commands_immutable' AND tgenabled<>'O')
 THEN RAISE EXCEPTION 'apple_cleanup:postcondition_failed'; END IF;
 INSERT INTO apple_cleanup_report VALUES(jsonb_build_object('removedMatches',matches_i,'removedChildren',4,
  'removedCommands',commands_i,'settlements',0,'financialWrites',0,'walletBalancesBeforeAndAfter',balances_i,
  'preservedFingerprints',before_i,'reason','Owner requested removal of temporary APPLE harness and all affected Async matches'));
END $cleanup$;

SAVEPOINT installed_removal_proof;
-- Run after remove-apple-harness.sql inside a rollback transaction.
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

ROLLBACK TO SAVEPOINT installed_removal_proof;
RELEASE SAVEPOINT installed_removal_proof;
