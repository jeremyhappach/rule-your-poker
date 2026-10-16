import {readFile,writeFile} from 'node:fs/promises';
const sql=await readFile('supabase/tri-towers/authority.sql','utf8');
const names=['finish_stage','reduce','snapshot','action'];
const functions=[...sql.matchAll(/CREATE FUNCTION (?:private|public)\.tri_towers_(\w+)[\s\S]*?\$\$;/g)].filter(m=>names.includes(m[1]));
if(functions.length!==4)throw Error('Expected exactly four TriTowers routines');
await writeFile('supabase/migrations/20261016011439_tri_towers_stage_results.sql',`-- TriTowers stage presentation and Take Score. No row, financial or admission changes.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='10s';
${functions.map(m=>m[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')).join('\n\n')}
REVOKE ALL ON FUNCTION private.tri_towers_finish_stage(jsonb,text,integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
`);
