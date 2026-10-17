-- Three-minute new games. Activation follows client publication.
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='5s';
CREATE FUNCTION private.eleven_up_rules_v2() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.eleven_up_rules()||'{"version":"eleven-up/2","stageMs":180000}'::jsonb
$$;
REVOKE ALL ON FUNCTION private.eleven_up_rules_v2() FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('eleven-up/2','eleven-up',private.eleven_up_rules_v2(),false);
-- Use the same enabled registry entry that Arcade freezes at admission.
CREATE FUNCTION private.eleven_up_admission_rules() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT config FROM private.arcade_rulesets WHERE game='eleven-up' AND enabled ORDER BY id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.eleven_up_admission_rules() FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE owner oid:='public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure;
BEGIN
 IF (SELECT md5(replace(prosrc,E'\r','')) FROM pg_proc WHERE oid=owner) IS DISTINCT FROM '9f2eabc422c3075286a8b031a2303807' THEN RAISE EXCEPTION 'eleven_up:configure_owner_drift';END IF;
 EXECUTE replace(pg_get_functiondef(owner),'private.eleven_up_rules()','private.eleven_up_admission_rules()');
END $$;
NOTIFY pgrst,'reload schema';
