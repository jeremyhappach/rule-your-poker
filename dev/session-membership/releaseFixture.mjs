// Release-only supplement to a disposable LOCAL clone. Inputs are read-only
// production definition captures, never production rows, keys or balances.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {definition} from '../battle31/canonical-lifecycle.mjs';
export async function prepareReleaseFixture({query,val,pass}) {
 assert.match(await val('SELECT current_database() v'),/^session_membership_\d+$/);
 assert.equal(await val('SELECT inet_server_addr()::text v'),'127.0.0.1/32');
 const baseline=JSON.parse(read('qualification.local/session-membership/production-preimages.json','utf8'));
 const supplement=JSON.parse(read('qualification.local/session-membership/production-fixture-supplement.json','utf8'));
 // Current main's exact 357 owner; the source migration checks its predecessor.
 // Git checks this file out as CRLF on Windows; the deployed SQL body uses LF.
 await query(read('supabase/migrations/20261103000630_three_five_seven_bot_hand_strength.sql','utf8').replace(/\r\n/g,'\n'));
 // The local schema capture excludes Supabase-managed Auth sessions. There are
 // no real sessions/subscriptions here; restore the columns referenced by push
 // eligibility so the exact production trigger can remain installed/enabled.
 if(!await val("SELECT to_regclass('auth.sessions')::text v"))await query('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz)');
 // Empty push preferences/subscriptions cannot send or enqueue user alerts.
 // No dispatcher, scheduler or external delivery service runs in this clone.
 if(!await val("SELECT to_regprocedure('private.delayed_human(uuid)')::text v"))await query(definition('20261029002655_async_combined_five_games.sql','private.delayed_human'));
 if(!await val("SELECT to_regclass('private.push_defaults')::text v")) {
  const pushSchema=read('supabase/web-push/candidate.sql','utf8').split('-- Existing matches explicitly opt out.')[0];
  await query(pushSchema);
 }
 for(const t of supplement.find(x=>x.kind==='tables').data) {
  if(!await val('SELECT to_regclass($1)::text v',[t.name]))await query(t.ddl);
 }
 for(const f of supplement.find(x=>x.kind==='functions').data)await query(f.definition);
 const triggers=baseline.find(x=>x.kind==='triggers').data;
 for(const t of triggers.filter(t=>t.function==='private.owner_close_seal()'||t.trigger==='push_table_changed'))await query(t.definition);
 const signatures=[...baseline.find(x=>x.kind==='owners').data,...baseline.find(x=>x.kind==='financial_functions').data];
 for(const f of signatures)assert.equal(await val('SELECT md5(pg_get_functiondef(to_regprocedure($1))) v',[f.signature]),f.hash,f.signature);
 const observed=(await query("SELECT tgname,tgrelid::regclass::text tbl,tgenabled,pg_get_triggerdef(oid) definition,md5(pg_get_functiondef(tgfoid)) hash FROM pg_trigger WHERE NOT tgisinternal")).rows;
 for(const t of triggers){
  const local=observed.find(x=>x.tbl===t.table&&x.tgname===t.trigger);
  assert(local,t.trigger);assert.equal(local.hash,t.hash,t.trigger);assert.equal(local.tgenabled,t.enabled,t.trigger);
  if(local.definition!==t.definition){
   // Postgres deparses this associative OR differently across versions. Prove
   // equivalence by round-tripping the exact production SQL locally, keeping
   // the original definition, function hash and enabled-state assertions.
   assert.equal(t.trigger,'golf_player_controls');
   await query('BEGIN');
   await query('DROP TRIGGER golf_player_controls ON public.players');
   await query(t.definition);
   await query('COMMIT');
   const roundTrip=await val("SELECT pg_get_triggerdef(oid) v FROM pg_trigger WHERE tgrelid='public.players'::regclass AND tgname='golf_player_controls'");
   assert.equal(roundTrip,local.definition,'production Golf trigger round trip');
   continue;
  }
  assert.equal(local.definition,t.definition,t.trigger);
 }
 const indexes=(await query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'")).rows;
 for(const ix of baseline.find(x=>x.kind==='indexes').data)assert.equal(indexes.find(x=>x.tablename===ix.table&&x.indexname===ix.name)?.indexdef,ix.definition,ix.name);
 write('qualification.local/session-membership/release-parity.json',JSON.stringify({passed:true,localOnly:true,owners:signatures.map(f=>({signature:f.signature,hash:f.hash})),triggers:triggers.length,indexes:baseline.find(x=>x.kind==='indexes').data.length},null,2));
 pass('release fixture matches deployed host/financial owners, 86 enabled trigger definitions and 18 conflict indexes; latest main 357 owner preserved');
}
