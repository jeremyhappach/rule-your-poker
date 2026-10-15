import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const opts=JSON.parse(readFileSync('qualification.local/farkle-audit-20261015/local-db.json'));
assert.equal(opts.host,'127.0.0.1');assert.equal(opts.port,55439);
assert.match(process.argv[2]??'',/^farkle_audit_empty_[0-9]+$/);assert.equal(opts.database,process.argv[2]);
const c=new pg.Client({...opts,database:'postgres'});await c.connect();
try{
 assert.equal((await c.query('select pid from pg_stat_activity where datname=$1',[opts.database])).rowCount,0);
 await c.query('DROP DATABASE "'+opts.database+'"');
 assert.equal((await c.query('select 1 from pg_database where datname=$1',[opts.database])).rowCount,0);
 const evidence={at:new Date().toISOString(),droppedDatabase:opts.database,verifiedAbsent:true,productionWrites:0};
 writeFileSync('supabase/farkle/financial-correction/20261015/cleanup-handoff.json',JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await c.end();}
