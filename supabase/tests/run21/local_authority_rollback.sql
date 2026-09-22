-- Run against the disposable local play-test database after its normal API proof.
-- Checks current catalog/security and the existing canonical fixture cleanup path.
BEGIN;
CREATE FUNCTION pg_temp.assert_run21(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'run21_authority_proof:%',label; END IF; END $$;
DO $$
DECLARE role_name text; relation_name text; fn regprocedure; actor uuid; before_count bigint;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH relation_name IN ARRAY ARRAY['private.run21_matches','private.run21_settlements'] LOOP
      PERFORM pg_temp.assert_run21(NOT has_table_privilege(role_name,relation_name,'SELECT,INSERT,UPDATE,DELETE'),'private_table_'||role_name||'_'||relation_name);
      PERFORM pg_temp.assert_run21((SELECT relrowsecurity FROM pg_class WHERE oid=relation_name::regclass),'private_rls_'||relation_name);
    END LOOP;
    FOREACH fn IN ARRAY ARRAY['public.run21_server_load(uuid)'::regprocedure,'public.run21_server_commit(uuid,bigint,jsonb,bigint)'::regprocedure,'public.run21_server_close(uuid,uuid)'::regprocedure] LOOP
      PERFORM pg_temp.assert_run21(NOT has_function_privilege(role_name,fn,'EXECUTE'),'server_only_'||fn||'_'||role_name);
      PERFORM pg_temp.assert_run21(has_function_privilege('service_role',fn,'EXECUTE'),'service_grant_'||fn);
    END LOOP;
  END LOOP;
  PERFORM pg_temp.assert_run21(NOT has_function_privilege('anon','public.run21_configure_local(uuid,uuid,integer,text,jsonb,timestamptz)','EXECUTE'),'anonymous_setup_denied');
  PERFORM pg_temp.assert_run21(NOT EXISTS(SELECT 1 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id WHERE g.real_money),'fake_money_only');
  PERFORM pg_temp.assert_run21(EXISTS(SELECT 1 FROM private.run21_settlements),'actual_played_match_required');
  PERFORM pg_temp.assert_run21(NOT EXISTS(SELECT 1 FROM private.run21_settlements s JOIN private.run21_matches m USING(dealer_game_id)
    WHERE (m.state#>>'{settlement,resultId}')::uuid<>s.id OR (m.state#>>'{settlement,transferBatchId}')::uuid<>s.transfer_batch_id
      OR m.state#>>'{settlement,winnerId}'<>s.winner_id::text OR (m.state#>>'{settlement,amount}')::integer<>s.amount),'receipt_agreement');
  PERFORM pg_temp.assert_run21(NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id IN(SELECT game_id FROM private.run21_matches)),'no_account_transactions');
  SELECT user_id INTO STRICT actor FROM public.user_roles WHERE role='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  -- The gate must still fail closed even for an authenticated administrator.
  UPDATE private.run21_app_test_release SET enabled=false;
  BEGIN
    PERFORM public.run21_server_load(NULL);
    RAISE EXCEPTION 'run21_authority_proof:closed_gate_bypassed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE private.run21_app_test_release SET enabled=true;
  SELECT count(*) INTO before_count FROM private.run21_matches;
  PERFORM pg_temp.assert_run21(before_count>0,'canonical_fixtures_exist');
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_delete_fake_money_games();
  RESET ROLE;
  PERFORM pg_temp.assert_run21((SELECT count(*)=0 FROM private.run21_matches),'canonical_match_cleanup');
  PERFORM pg_temp.assert_run21((SELECT count(*)=0 FROM private.run21_settlements),'canonical_receipt_cleanup');
END $$;
ROLLBACK;
