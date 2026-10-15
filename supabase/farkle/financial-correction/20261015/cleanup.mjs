import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const opts=JSON.parse(readFileSync('qualification.local/farkle-audit-20261015/local-db.json'));
assert.equal(opts.host,'127.0.0.1');assert.equal(opts.port,55439);
assert.equal(opts.database,'farkle_audit_empty_1792090758083');
const c=new pg.Client({...opts,database:'postgres'});await c.connect();
try {
 const sessions=(await c.query('select pid from pg_stat_activity where datname=$1',[opts.database])).rows;assert.equal(sessions.length,0);
 await c.query('DROP DATABASE "'+opts.database+'"');
 assert.equal((await c.query('select 1 from pg_database where datname=$1',[opts.database])).rowCount,0);
 const receipt={droppedDatabase:opts.database,verifiedAbsent:true,existingPostgresRuntimePreserved:true,fullSupabaseStackStarted:false,installedTooling:[],at:new Date().toISOString()};
 writeFileSync('supabase/farkle/financial-correction/20261015/cleanup.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally {await c.end();}
