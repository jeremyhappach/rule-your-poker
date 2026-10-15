import {readFile,writeFile} from 'node:fs/promises';
const sql=await readFile('supabase/tri-towers/authority.sql','utf8');
const engine=sql.slice(sql.indexOf('CREATE FUNCTION private.tri_towers_rules'),sql.indexOf('CREATE FUNCTION private.tri_towers_publish')).replaceAll('private.tri_towers_','pg_temp.tri_towers_');
const proof=await readFile('supabase/tri-towers/engine-proof.sql','utf8');
await writeFile('qualification.local/tri-towers/engine-proof.sql',`BEGIN; SET LOCAL statement_timeout='5s'; CREATE TEMP TABLE tri_engine_scope(id integer) ON COMMIT DROP;\n${engine}\n${proof}\nROLLBACK;`);
