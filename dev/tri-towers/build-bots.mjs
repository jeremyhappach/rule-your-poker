import {readFile,writeFile,readdir} from 'node:fs/promises';
const root='supabase/migrations/';
const name=(await readdir(root)).find(n=>n.endsWith('_tri_towers_bots.sql'));
if(!name)throw Error('Create migration with installed Supabase CLI first');
const source=await readFile('supabase/tri-towers/authority.sql','utf8');
const configure=source.match(/CREATE FUNCTION public\.tri_towers_configure[\s\S]*?\$\$;/)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
const bots=['bot_choice','schedule_bot','recover'].map(name=>source.match(new RegExp('CREATE FUNCTION private\\.tri_towers_'+name+'\\([\\s\\S]*?\\$\\$;'))[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')).join('\n\n');
const sql=`BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.tri_towers_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure))<>'8b9f3aaaa816f27054009567f51db10b'
  OR md5(pg_get_functiondef('private.tri_towers_recover()'::regprocedure))<>'55191a871e50b211f396a4fb0db37db3' THEN
  RAISE EXCEPTION 'tri_towers:bot_migration_authority_changed';
 END IF;
END $guard$;
ALTER TABLE private.tri_towers_matches ADD COLUMN bot_due_at bigint;
CREATE INDEX tri_towers_matches_due ON private.tri_towers_matches(least((state->>'deadline')::bigint,bot_due_at),dealer_game_id)
 WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL;
${bots}
CREATE TRIGGER tri_towers_schedule_bot BEFORE INSERT OR UPDATE ON private.tri_towers_matches FOR EACH ROW EXECUTE FUNCTION private.tri_towers_schedule_bot();
${configure}
REVOKE ALL ON FUNCTION private.tri_towers_bot_choice(jsonb,bigint),private.tri_towers_schedule_bot(),private.tri_towers_recover() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='tri-towers-recovery'),schedule:='1 second');
NOTIFY pgrst,'reload schema';
COMMIT;
`;
await writeFile(root+name,sql);console.log(name);
