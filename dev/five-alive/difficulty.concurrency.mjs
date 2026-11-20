// Disposable local PostgreSQL proof; never connects to hosted projects.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {connect} from '../async-words/local.mjs';
const admin=await connect('postgres'),database='five_alive_relative_'+Date.now();
let db,left,right,created=false;
const sql=readFileSync('supabase/five-alive/difficulty-relative-v1.sql','utf8');
const words=readFileSync('server/fiveAlive/answers.reviewed.v3.txt','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(' '));
const allocate=(client,id)=>client.query("SELECT private.five_alive_allocate('arcade',$1,'esdb-five-alive/3') answers",[id]).then(r=>r.rows[0].answers);
async function blocked(client,blocker){for(let i=0;i<40;i++){const row=(await db.query('SELECT $2::int=ANY(pg_blocking_pids($1)) blocked',[client.processID,blocker.processID])).rows[0];if(row.blocked)return;await new Promise(r=>setTimeout(r,25));}assert.fail('expected actual PostgreSQL pool-row lock wait');}
try{
 await admin.query('CREATE DATABASE '+database);created=true;
 db=await connect(database);left=await connect(database);right=await connect(database);
 for(const client of [db,left,right])await client.query("SET statement_timeout='15s'");
 await db.query('CREATE SCHEMA private;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions');
 await db.query(readFileSync('supabase/five-alive/pool.sql','utf8'));
 await db.query(readFileSync('dev/five-alive/difficulty.allocator-preimage.sql','utf8'));
 await db.query("INSERT INTO private.five_alive_answers SELECT 'esdb-five-alive/3',word,tier::smallint FROM unnest($1::text[],$2::text[]) x(word,tier)",[words.map(x=>x[0]),words.map(x=>x[1])]);
 await db.query("INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/3')");
 const legacyId=randomUUID();await left.query('BEGIN');const legacy=await allocate(left,legacyId);
 await right.query('BEGIN');const cutover=right.query(sql);await blocked(right,left);await left.query('COMMIT');await cutover;await right.query('COMMIT');
 assert.deepEqual(await allocate(db,legacyId),legacy);
 assert.equal((await db.query('SELECT count(*)::int n FROM private.five_alive_allocation_difficulty WHERE owner_id=$1',[legacyId])).rows[0].n,0);
 console.log('PASS allocation before cutover retains legacy tier after waiting migration');
 await right.query('BEGIN');await right.query(sql);await left.query('BEGIN');const newId=randomUUID(),afterCutover=allocate(left,newId);await blocked(left,right);await right.query('COMMIT');await afterCutover;await left.query('COMMIT');
 assert.equal((await db.query("SELECT count(*)::int n FROM private.five_alive_allocation_difficulty WHERE owner_id=$1 AND difficulty_version='five-alive-relative/1' AND multiplier_percent=60+20*difficulty",[newId])).rows[0].n,3);
 console.log('PASS allocation waiting behind cutover snapshots new version and multiplier');
 const retryId=randomUUID();await left.query('BEGIN');const rolledBack=await allocate(left,retryId);await right.query('BEGIN');const retry=allocate(right,retryId);await blocked(right,left);await left.query('ROLLBACK');const committed=await retry;await right.query('COMMIT');
 assert.deepEqual(committed,rolledBack);assert.deepEqual(await allocate(db,retryId),committed);
 assert.equal((await db.query('SELECT count(*)::int n FROM private.five_alive_allocation_difficulty WHERE owner_id=$1',[retryId])).rows[0].n,3);
 console.log('PASS interrupted allocation rolls back cursor and snapshots; concurrent retry allocates once');
 await left.query('BEGIN');const one=await allocate(left,randomUUID());await right.query('BEGIN');const other=allocate(right,randomUUID());await blocked(right,left);await left.query('COMMIT');const two=await other;await right.query('COMMIT');
 assert.equal(new Set([...one,...two].map(x=>x.word)).size,6);
 console.log('PASS concurrent distinct owners retain global no-repeat allocation');
 mkdirSync('qualification.local/five-alive-relative',{recursive:true});writeFileSync('qualification.local/five-alive-relative/concurrency.json',JSON.stringify({status:'PASS',cases:4,version:'five-alive-relative/1',localOnly:true},null,2));
}finally{
 for(const client of [left,right,db])if(client){await client.query('ROLLBACK').catch(()=>{});await client.end();}
 if(created)await admin.query('DROP DATABASE '+database);await admin.end();
}
