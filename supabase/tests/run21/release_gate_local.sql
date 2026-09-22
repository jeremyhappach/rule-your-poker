-- Isolated SQL unit proof with minimal dependency fixtures, NOT Supabase
-- qualification or proof of Run21 gameplay/settlement. Everything rolls back.
DO $$ BEGIN
  IF current_user <> 'run21_proof' OR inet_server_port() <> 55421 OR inet_server_addr() <> '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Refusing proof outside the isolated local PostgreSQL instance';
  END IF;
END $$;
SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), version();
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE TABLE public.proof_admins(user_id uuid PRIMARY KEY);
CREATE TABLE public.games(id uuid PRIMARY KEY, real_money boolean NOT NULL);
CREATE TABLE public.players(id uuid PRIMARY KEY, game_id uuid, user_id uuid, is_bot boolean NOT NULL);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.proof_admins WHERE user_id = _user_id);
$$;
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Proof failed: %', label; END IF; END;
$$;
\ir ../../migrations/20260921211828_run21_reconciled_app_test_release_gate.sql
-- Applying the same migration again must not enable/reset the release.
\ir ../../migrations/20260921211828_run21_reconciled_app_test_release_gate.sql
SELECT pg_temp.assert_true(NOT enabled AND NOT qualified AND project_ref IS NULL, 'closed defaults')
  FROM private.run21_app_test_release;
SELECT pg_temp.assert_true(relrowsecurity, 'private gate RLS') FROM pg_class
 WHERE oid = 'private.run21_app_test_release'::regclass;
SELECT pg_temp.assert_true(NOT has_table_privilege(role_name, 'private.run21_app_test_release', 'SELECT,INSERT,UPDATE,DELETE'), 'no direct release access: ' || role_name)
 FROM unnest(ARRAY['anon','authenticated','service_role']) AS r(role_name);
SELECT pg_temp.assert_true(NOT has_function_privilege(role_name, 'public.run21_app_test_capabilities(uuid)', 'EXECUTE'), 'no capability execute: ' || role_name)
 FROM unnest(ARRAY['anon','service_role']) AS r(role_name);
SELECT pg_temp.assert_true(has_function_privilege('authenticated', 'public.run21_app_test_capabilities(uuid)', 'EXECUTE'), 'authenticated capability grant');

INSERT INTO public.proof_admins VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.games VALUES ('22222222-2222-4222-8222-222222222222', false);
INSERT INTO public.players VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((public.run21_app_test_capabilities()->>'enabled')::boolean = false, 'admin cannot bypass disabled release');
RESET ROLE;

DO $$ BEGIN
  BEGIN
    UPDATE private.run21_app_test_release SET enabled = true;
    RAISE EXCEPTION 'unqualified enable unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE private.run21_app_test_release SET qualified = true, enabled = true, project_ref = 'xvhmbuppghwmwpwrkzao';
    RAISE EXCEPTION 'production target unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE private.run21_app_test_release SET project_ref = 'abcdefghijklmnopqrst', qualified = true, enabled = true;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((public.run21_app_test_capabilities('22222222-2222-4222-8222-222222222222')->>'enabled')::boolean, 'qualified admin fake-money session');
SELECT pg_temp.assert_true(public.run21_app_test_capabilities('22222222-2222-4222-8222-222222222222')->>'project_ref' = 'abcdefghijklmnopqrst', 'explicit target identity');
SELECT pg_temp.assert_true((public.run21_app_test_capabilities('44444444-4444-4444-8444-444444444444')->>'enabled')::boolean = false, 'missing session denied');
RESET ROLE;

UPDATE public.games SET real_money = true;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((public.run21_app_test_capabilities('22222222-2222-4222-8222-222222222222')->>'enabled')::boolean = false, 'real money denied');
RESET ROLE;
UPDATE public.games SET real_money = false;
INSERT INTO public.players VALUES ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666666', false);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((public.run21_app_test_capabilities('22222222-2222-4222-8222-222222222222')->>'enabled')::boolean = false, 'non-admin participant denied');
RESET ROLE;
DELETE FROM public.players WHERE id = '55555555-5555-4555-8555-555555555555';
DELETE FROM public.proof_admins;
-- User-editable JWT metadata must not restore the removed protected role.
SELECT set_config('request.jwt.claims', '{"user_metadata":{"is_admin":true}}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.run21_app_test_capabilities() = '{"version":1,"enabled":false}'::jsonb, 'role revocation and forged metadata denied');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_true(public.run21_app_test_capabilities() = '{"version":1,"enabled":false}'::jsonb, 'missing authenticated identity denied');
RESET ROLE;
ROLLBACK;
DO $$ BEGIN
  IF to_regclass('private.run21_app_test_release') IS NOT NULL OR
     EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) THEN
    RAISE EXCEPTION 'Proof left fixtures after rollback';
  END IF;
END $$;
SELECT 'Run21 release-gate SQL unit proof passed; all fixtures rolled back' AS result;
