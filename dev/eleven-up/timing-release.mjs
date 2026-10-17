// Generate a guarded admission-only migration. The frozen v1 rules remain intact.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path=process.argv[2];
if(!path?.match(/^supabase\/migrations\/\d+_eleven_up_three_minute\.sql$/))throw Error('Pass the CLI-created migration path');
const source=await readFile('supabase/eleven-up/multiplayer.sql','utf8');
const configure=source.match(/CREATE FUNCTION public\.eleven_up_configure[\s\S]*?AS \$\$([\s\S]*?)END \$\$;/);
if(!configure)throw Error('Missing configure source');
const hash=createHash('md5').update((configure[1]+'END ').replaceAll('\r','')).digest('hex');
const sql=`-- Three-minute new games. Activation follows client publication.
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
 IF (SELECT md5(replace(prosrc,E'\\r','')) FROM pg_proc WHERE oid=owner) IS DISTINCT FROM '${hash}' THEN RAISE EXCEPTION 'eleven_up:configure_owner_drift';END IF;
 EXECUTE replace(pg_get_functiondef(owner),'private.eleven_up_rules()','private.eleven_up_admission_rules()');
END $$;
NOTIFY pgrst,'reload schema';
`;
await writeFile(path,sql);
console.log('Generated guarded three-minute admission migration.');
