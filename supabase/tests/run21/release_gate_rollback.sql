-- Current Supabase catalog proof; caller supplies canonical admin/peer auth fixtures.
BEGIN;
CREATE FUNCTION pg_temp.run21_assert(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'run21_gate:%',label; END IF;
END $$;
DO $proof$
DECLARE admin_id uuid; peer_id uuid; result jsonb;
BEGIN
  SELECT id INTO STRICT admin_id FROM public.profiles WHERE public.is_admin(id) LIMIT 1;
  SELECT id INTO STRICT peer_id FROM public.profiles WHERE NOT public.is_admin(id) LIMIT 1;
  PERFORM pg_temp.run21_assert((SELECT NOT enabled AND NOT qualified AND project_ref IS NULL FROM private.run21_app_test_release),'disabled_defaults');
  PERFORM pg_temp.run21_assert((SELECT relrowsecurity FROM pg_class WHERE oid='private.run21_app_test_release'::regclass),'private_rls');
  PERFORM pg_temp.run21_assert(NOT has_table_privilege('authenticated','private.run21_app_test_release','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','private.run21_app_test_release','SELECT,INSERT,UPDATE,DELETE'),'no_direct_access');
  PERFORM pg_temp.run21_assert(NOT has_function_privilege('anon','public.run21_app_test_capabilities(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.run21_app_test_capabilities(uuid)','EXECUTE'),'rpc_grants');
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SET LOCAL ROLE authenticated;
  result:=public.run21_app_test_capabilities();
  RESET ROLE;
  PERFORM pg_temp.run21_assert(result->>'enabled'='false','admin_cannot_bypass_closed_gate');
  BEGIN
    UPDATE private.run21_app_test_release SET enabled=true;
    RAISE EXCEPTION 'run21_gate:unqualified_enable_allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  FOREACH result IN ARRAY ARRAY[to_jsonb('xvhmbuppghwmwpwrkzao'::text),to_jsonb('ajjbrxlnrhchhtlfbtgz'::text)] LOOP
    BEGIN
      UPDATE private.run21_app_test_release SET qualified=true,enabled=true,project_ref=result#>>'{}';
      RAISE EXCEPTION 'run21_gate:production_target_allowed';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  UPDATE private.run21_app_test_release SET qualified=true,enabled=true,project_ref='local';
  PERFORM set_config('request.jwt.claim.sub',peer_id::text,true);
  SET LOCAL ROLE authenticated;
  result:=public.run21_app_test_capabilities();
  RESET ROLE;
  PERFORM pg_temp.run21_assert(result->>'enabled'='false','nonadmin_denied');
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SET LOCAL ROLE authenticated;
  result:=public.run21_app_test_capabilities();
  PERFORM pg_temp.run21_assert(result->>'enabled'='true' AND result->>'fake_money_only'='true' AND result->>'user_id'=admin_id::text,'scoped_local_admin');
  result:=public.run21_app_test_capabilities(gen_random_uuid());
  RESET ROLE;
  PERFORM pg_temp.run21_assert(result->>'enabled'='false','unknown_session_denied');
END $proof$;
ROLLBACK;
