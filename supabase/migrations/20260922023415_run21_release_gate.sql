-- Run21 app-test admission configuration. NON-PRODUCTION ONLY.
-- This migration deliberately does not enable creation or change existing RPCs.
-- Apply only after verifying the target identity and running rollback proofs.
CREATE TABLE IF NOT EXISTS private.run21_app_test_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  qualified boolean NOT NULL DEFAULT false,
  project_ref text,
  CHECK (project_ref IS NULL OR (project_ref ~ '^[a-z]{20}$' AND
    project_ref NOT IN ('xvhmbuppghwmwpwrkzao', 'ajjbrxlnrhchhtlfbtgz')) OR project_ref = 'local'),
  CHECK (NOT enabled OR (qualified AND project_ref IS NOT NULL))
);
ALTER TABLE private.run21_app_test_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_app_test_release FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.run21_app_test_release(singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- Read-only capability response for discovery. No caller-controlled role,
-- environment, or real-money flag is trusted. No administrative setter is
-- exposed to clients; operator qualification precedes enabling this row.
CREATE OR REPLACE FUNCTION public.run21_app_test_capabilities(p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_release private.run21_app_test_release%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT coalesce(public.is_admin(v_actor), false) THEN
    RETURN jsonb_build_object('version', 1, 'enabled', false);
  END IF;
  SELECT * INTO v_release FROM private.run21_app_test_release WHERE singleton;
  v_allowed := coalesce(v_release.enabled AND v_release.qualified, false);
  IF p_session_id IS NOT NULL THEN
    v_allowed := v_allowed AND EXISTS (
      SELECT 1 FROM public.games g WHERE g.id = p_session_id AND g.real_money = false
    ) AND NOT EXISTS (
      SELECT 1 FROM public.players p WHERE p.game_id = p_session_id AND NOT p.is_bot
        AND NOT coalesce(public.is_admin(p.user_id), false)
    );
  END IF;
  RETURN jsonb_build_object(
    'version', 1, 'enabled', v_allowed, 'user_id', v_actor,
    'session_id', p_session_id, 'project_ref', v_release.project_ref,
    'fake_money_only', true
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.run21_app_test_capabilities(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run21_app_test_capabilities(uuid) TO authenticated;

COMMENT ON TABLE private.run21_app_test_release IS
  'Run21 non-production release gate. Leave disabled/unqualified until authority, admission, settlement, replay and two-client proofs pass.';
