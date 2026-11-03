// Disposable local PostgreSQL only. Never connects to hosted authority.
import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const database='async_runback_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE async_real_1793571492049');await root.end();
const db=await connect(database),peer=await connect(database),observer=await connect(database),checks=[];
const q=async(sql,args=[],client=db)=>(await client.query(sql,args)).rows[0]?.v;
const candidate=read('supabase/delayed/runback.candidate.sql','utf8');
const pass=label=>{checks.push(label);console.log('PASS',label);};
const as=async(who,c=db)=>c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[who]);
const fail=async(fn,pattern)=>{await db.query('SAVEPOINT expected_failure');try{await assert.rejects(fn,pattern);}finally{await db.query('ROLLBACK TO expected_failure');}};
const financial=async()=>q("SELECT jsonb_build_object('matches',(SELECT count(*) FROM private.delayed_matches),'settlements',(SELECT count(*) FROM private.delayed_settlements),'accounts',(SELECT count(*) FROM public.player_transactions),'games',(SELECT count(*) FROM public.games),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches)) v");
const protectedHashes=()=>q("SELECT jsonb_object_agg(n.nspname||'.'||p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN('delayed_respond','delayed_finalize','settle_gameplay_chip_transfers','record_session_results','finalize_gameplay_transfer_batch')");
async function fixture(realMoney=false){
 const a=randomUUID(),b=randomUUID(),outside=randomUUID();
 for(const user of [a,b,outside]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true",[user,'Runback '+user.slice(0,8)]);}
 await as(a);
 const caps=await q('SELECT public.delayed_capabilities() v');
 const lineup=[caps.games[1],caps.games[0],caps.games[1]].map((g,i)=>({game:g.id,stake:7+i*2,config:g.rules}));
 const id=await q('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),b,realMoney,JSON.stringify(lineup)]);
 const offerHash=await q('SELECT offer_hash v FROM private.delayed_matches WHERE id=$1',[id]);
 await as(b);await q("SELECT public.delayed_respond($1,$2,$3,'accept') v",[id,randomUUID(),offerHash]);
 const children=(await db.query('SELECT id,revision FROM private.delayed_children WHERE match_id=$1 ORDER BY ordinal',[id])).rows;
 for(const c of children)await q("SELECT private.delayed_record_outcome($1,$2,'normal',$3,'{}') v",[c.id,c.revision,a]);
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 const events=(await db.query('SELECT id FROM private.delayed_review_events WHERE match_id=$1',[id])).rows;
 for(const actor of [a,b]){await as(actor);for(const e of events)await q('SELECT public.delayed_review_ack($1) v',[e.id]);}
 return {a,b,outside,id,lineup};
}
try{
 // Bring this existing isolated fixture to the verified admission baseline only.
 await db.query(read('supabase/delayed/real-money.candidate.sql','utf8').replace(/\r/g,''));
 for(const f of JSON.parse(read('dev/async-runback/preimage.json'))){
  const sig=f.schema+'.'+f.name+'('+f.args.split(',').map(x=>x.trim().split(' ').at(-1)).filter(Boolean).join(',')+')';
  const actual=await q("SELECT replace(pg_get_functiondef($1::regprocedure),chr(13),'') v",[sig]);
  assert.equal(actual,f.definition,'installed baseline '+sig);
 }
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp(); UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true; UPDATE private.delayed_recovery_state SET enabled=true");
 const protectedBefore=await protectedHashes(),counts=await financial();
 await db.query('BEGIN');
 await db.query(candidate);await db.query(candidate.replace(/\r?\n/g,'\r\n'));pass('guarded candidate compiles and reapplies idempotently with LF/CRLF against verified deployed preimages');
 const baselineProof=await db.query(read('supabase/delayed/real-money-proof.sql','utf8'));
 const financialChecks=(Array.isArray(baselineProof)?baselineProof:[baselineProof]).flatMap(r=>r.rows??[]).find(r=>r.checks)?.checks;
 assert.equal(financialChecks.length,26);pass('all 26 existing real-money financial, admission, acceptance and replay groups pass');
 await db.query('ROLLBACK');assert.deepEqual(await financial(),counts);pass('candidate and complete financial regression proof roll back');
 await db.query('BEGIN');await db.query(candidate);
 for(const realMoney of [false,true]){
  const f=await fixture(realMoney);
  await as(f.a);const before=await financial(),history=await q('SELECT public.delayed_history_detail($1) v',[f.id]);
  assert.equal(history.realMoney,realMoney);assert.equal(history.opponentEligible,true);assert.equal(history.runbackEligible,false);
  assert.deepEqual(history.lineup.map(c=>({game:c.game,stake:c.stake,config:c.config})),f.lineup);
  assert.deepEqual(await financial(),before);
  await q('SELECT public.delayed_finale_ack($1) v',[f.id]);assert.equal((await q('SELECT public.delayed_history_detail($1) v',[f.id])).runbackEligible,false);
  await as(f.b);await q('SELECT public.delayed_finale_ack($1) v',[f.id]);assert.equal((await q('SELECT public.delayed_history_detail($1) v',[f.id])).runbackEligible,true);
  await q('SELECT public.delayed_finale_ack($1) v',[f.id]);await as(f.a);await q('SELECT public.delayed_finale_ack($1) v',[f.id]);
  assert.equal((await q('SELECT public.delayed_history_detail($1) v',[f.id])).runbackEligible,false);
  assert.deepEqual(await financial(),before);
  pass((realMoney?'Real':'Fake')+' exact archive reconstruction and one durable last-viewer shortcut; reads/ACKs have zero financial effects');
  const immutable=await q("SELECT jsonb_build_object('match',(SELECT to_jsonb(m) FROM private.delayed_matches m WHERE id=$1),'children',(SELECT jsonb_agg(to_jsonb(c) ORDER BY ordinal) FROM private.delayed_children c WHERE match_id=$1)) v",[f.id]);
  for(const actor of [f.a,f.b]){
   await as(actor);await db.query('SET LOCAL ROLE authenticated');
   const req=randomUUID(),args=[req,actor===f.a?f.b:f.a,realMoney,JSON.stringify(f.lineup)];
   const next=await q('SELECT public.delayed_create($1,$2,$3,$4) v',args);
   assert.notEqual(next,f.id);assert.equal(await q('SELECT public.delayed_create($1,$2,$3,$4) v',args),next);
   assert.notEqual(await q('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),...args.slice(1)]),next);
   await db.query('RESET ROLE');
   assert.equal(await q("SELECT status v FROM private.delayed_matches WHERE id=$1",[next]),'invited');
   assert.equal(await q('SELECT count(*)::int v FROM public.player_transactions WHERE source_game_id=$1',[next]),0);
  }
  assert.deepEqual(await q("SELECT jsonb_build_object('match',(SELECT to_jsonb(m) FROM private.delayed_matches m WHERE id=$1),'children',(SELECT jsonb_agg(to_jsonb(c) ORDER BY ordinal) FROM private.delayed_children c WHERE match_id=$1)) v",[f.id]),immutable);
  pass('Both participants may intentionally reuse '+(realMoney?'real':'fake')+' archive repeatedly; duplicate request returns one invite; historical source remains immutable');
  await as(f.outside);await fail(()=>q('SELECT public.delayed_history_detail($1) v',[f.id]),/not_found/);
  await as(f.a);const bad=structuredClone(f.lineup);bad[0].config.tampered=true;
  await fail(()=>q('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),f.b,realMoney,JSON.stringify(bad)]),/unsupported_configuration/);
  await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[f.b]);
  assert.equal((await q('SELECT public.delayed_history_detail($1) v',[f.id])).opponentEligible,false);
  await fail(()=>q('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),f.b,realMoney,JSON.stringify(f.lineup)]),/not_authorized/);
  await q('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),f.outside,realMoney,JSON.stringify(f.lineup)]);
  pass('Stranger archive denial, unsupported config rejection and recoverable inactive opponent '+realMoney);
 }
 assert.deepEqual(await protectedHashes(),protectedBefore);
 assert.equal(await q("SELECT has_table_privilege('authenticated','private.delayed_runback_viewers','SELECT') v"),false);
 assert.equal(await q("SELECT has_table_privilege('anon','private.delayed_runback_viewers','INSERT') v"),false);
 pass('canonical financial/acceptance definitions unchanged; shortcut table is private with RLS');
 await db.query('ROLLBACK');assert.deepEqual(await financial(),counts);pass('all fixture writes and candidate DDL roll back');
 // Only the disposable clone is committed for real independent-connection races.
 await db.query(candidate);await db.query('BEGIN');const f=await fixture();await db.query('COMMIT');
 const before=await financial();await as(f.a);await as(f.b,peer);
 await Promise.all([q('SELECT public.delayed_finale_ack($1) v',[f.id]),q('SELECT public.delayed_finale_ack($1) v',[f.id],peer)]);
 assert.equal(await q('SELECT count(*)::int v FROM private.delayed_runback_viewers WHERE match_id=$1',[f.id]),1);
 const winner=await q('SELECT viewer v FROM private.delayed_runback_viewers WHERE match_id=$1',[f.id]);
 assert([f.a,f.b].includes(winner));await Promise.all([q('SELECT public.delayed_finale_ack($1) v',[f.id]),q('SELECT public.delayed_finale_ack($1) v',[f.id],peer)]);
 assert.equal(await q('SELECT viewer v FROM private.delayed_runback_viewers WHERE match_id=$1',[f.id]),winner);assert.deepEqual(await financial(),before);
 pass('simultaneous ACKs on independent connections select exactly one viewer; duplicate/reconnect replay cannot change it');
 await as(f.a,peer);const args=[randomUUID(),f.b,false,JSON.stringify(f.lineup)];
 const receipts=await Promise.all([q('SELECT public.delayed_create($1,$2,$3,$4) v',args),q('SELECT public.delayed_create($1,$2,$3,$4) v',args,peer)]);
 assert.equal(receipts[0],receipts[1]);assert.equal(await q('SELECT count(*)::int v FROM private.delayed_requests WHERE actor=$1 AND request_id=$2',[f.a,args[0]]),1);
 pass('concurrent send retries on independent connections produce one invitation');
 mkdirSync('qualification.local/async-runback',{recursive:true});
 write('qualification.local/async-runback/database.json',JSON.stringify({passed:true,database,checks,financialChecks,protectedHashes:protectedBefore,scope:'local clone only; no hosted writes'},null,2));
}catch(e){console.error(e.message,e.where??'');process.exitCode=1;}
finally{await db.query('ROLLBACK');await Promise.all([db.end(),peer.end(),observer.end()]);const cleanup=await connect('postgres');try{assert(/^async_runback_\d+$/.test(database));await cleanup.query('DROP DATABASE '+database);}finally{await cleanup.end();}}
