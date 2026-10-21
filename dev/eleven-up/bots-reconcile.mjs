// Local synthetic fixture only: use Race Poker's accepted source-level harness.
// No deployment cron/publication or production preflight is simulated here.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './bots-database.mjs';
import {registeredSql,hash} from './bots-release-package.mjs';
const c=await connect(context().database),proofs=['core-proof','financial-proof','rollback-failure-proof'];
const raceSources=['rules','multiplayer','commands','registration'];
const sources=Object.fromEntries(raceSources.map(n=>[n,read(`supabase/race-poker/${n}.sql`,'utf8')]));
const definitions=async()=>(await c.query("select jsonb_object_agg(p.oid::regprocedure::text,md5(replace(pg_get_functiondef(p.oid),chr(13),''))) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'")).rows[0].v;
try{
 await c.query('begin');
 if(!(await c.query("select to_regclass('private.race_poker_matches') v")).rows[0].v){
  await c.query(Object.values(sources).join('\n'));
 }
 await c.query('commit');
 const before=await definitions();
 await c.query(registeredSql());
 const after=await definitions();
 const changed=Object.keys(after).filter(k=>after[k]!==before[k]);
 assert(changed.every(k=>k==='private.megatouch_begin(uuid,uuid)'));
 const shared=(await c.query("select pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure) v")).rows[0].v;
 assert(shared.includes("'race-poker'"));assert(shared.includes('eleven_up:bots_fake_money_only'));
 for(const rollback of [false,true]){
  await c.query('begin');
  if(rollback)await c.query(read('supabase/eleven-up/rollback-bot-admission.sql','utf8').replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'\n'));
  // Same isolated-local heartbeat seed as Race Poker's accepted financial harness.
  await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
  for(const p of proofs)await c.query(read(`supabase/race-poker/${p}.sql`,'utf8'));
  await c.query('rollback');
  console.log('PASS Race Poker rules, consent, accounting and fault rollback; bot admission rollback='+rollback);
 }
 assert.deepEqual(await definitions(),after);
 const result={database:context().database,main:'88c798396bd0202551e36dcf4cd9efa39c9ef555',migrationSha256:hash(registeredSql()),raceSourceHashes:Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,hash(s.replaceAll('\r\n','\n'))])),changedByBots:changed,proofs,withAdmissionRollback:'passed',raceDefinitions:'preserved',production:'not accessed; deployment/cron not installed in local fixture'};
 write('qualification.local/eleven-up-bots/reconciliation.json',JSON.stringify(result,null,2)+'\n');
}catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{await c.end();}
