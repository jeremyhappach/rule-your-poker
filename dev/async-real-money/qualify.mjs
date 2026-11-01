import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/async-real-money';mkdirSync(dir,{recursive:true});
const original=JSON.parse(read(dir+'/deployed-preimage.json'));
let database;
if(process.argv.includes('--existing'))database=JSON.parse(read(dir+'/context.json')).database;
else {const root=await connect('postgres');database='async_real_'+Date.now();await root.query('CREATE DATABASE '+database+' TEMPLATE async_reviews_1793308358890');await root.end();write(dir+'/context.json',JSON.stringify({database}));}
assert(/^async_real_\d+$/.test(database));
const db=await connect(database);
try{
 for(const f of original.definitions){assert.equal((await db.query("SELECT md5(replace(pg_get_functiondef($1::regprocedure),chr(13),'')) hash",[f.signature])).rows[0].hash,f.hash,f.signature);}
 const before=JSON.stringify((await db.query('SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM public.profiles) profiles,(SELECT count(*) FROM public.games) games,(SELECT count(*) FROM public.player_transactions) accounts')).rows);
 await db.query('BEGIN');
 // Only the isolated clone needs a fresh synthetic heartbeat; hosted proofs do not change health.
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 await db.query('UPDATE private.delayed_release SET admission_enabled=true');
 await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 await db.query(read('supabase/delayed/real-money.candidate.sql','utf8'));
 await db.query(read('supabase/delayed/real-money.candidate.sql','utf8')); // Idempotent and closed.
 const result=await db.query(read('supabase/delayed/real-money-proof.sql','utf8'));
 const checks=(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]).find(r=>r.checks)?.checks;
 assert.equal(checks.length,26);await db.query('ROLLBACK');
 assert.equal(JSON.stringify((await db.query('SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM public.profiles) profiles,(SELECT count(*) FROM public.games) games,(SELECT count(*) FROM public.player_transactions) accounts')).rows),before);
 write(dir+'/financial.json',JSON.stringify({passed:true,database,scope:'synthetic rollback; actual deployed canonical financial definitions and triggers',checks,rollbackVerified:true},null,2));
 console.log('PASS',checks.length,'financial check groups; all fixtures rolled back');
}catch(e){await db.query('ROLLBACK');console.error(e.message,e.where??'');process.exitCode=1;}finally{await db.end();}
