-- Retain authenticated/service compatibility while closing anonymous privileged
-- APIs. The small read-only predicate list remains available to RLS policies.
DO $acl$
DECLARE f record; signature text;
BEGIN
 FOR f IN SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args,
   has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_allowed,
   has_function_privilege('service_role',p.oid,'EXECUTE') service_allowed
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
   AND p.proname NOT IN('has_role','is_admin','user_in_game','user_is_in_game','cutover_write_lock_active')
 LOOP
  signature:=format('%I.%I(%s)',f.nspname,f.proname,f.args);
  IF f.authenticated_allowed THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO authenticated'; END IF;
  IF f.service_allowed THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO service_role'; END IF;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION '||signature||' FROM PUBLIC,anon';
 END LOOP;
END $acl$;
ALTER FUNCTION public.audit_cribbage_events_insert() SET search_path='';
ALTER FUNCTION public.holm_hand_label(integer[]) SET search_path='';
