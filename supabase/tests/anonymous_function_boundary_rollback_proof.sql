BEGIN;
DO $proof$
DECLARE denied boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
 AND p.proname NOT IN('has_role','is_admin','user_in_game','user_is_in_game','cutover_write_lock_active')
 AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'proof:anonymous_privileged_function'; END IF;
 EXECUTE 'SET LOCAL ROLE anon';
 denied:=false; BEGIN PERFORM public.chat_operation_sender_heartbeat('rollback-no-operation','{}');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:anonymous_diagnostic_mutation'; END IF;
 EXECUTE 'RESET ROLE';
 IF public.holm_hand_label(ARRAY[2])<>'Two Pair' THEN RAISE EXCEPTION 'proof:label_search_path'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN('public.holm_hand_label(integer[])'::regprocedure,'public.audit_cribbage_events_insert()'::regprocedure) AND proconfig IS NULL) THEN RAISE EXCEPTION 'proof:mutable_search_path'; END IF;
END $proof$;
ROLLBACK;
