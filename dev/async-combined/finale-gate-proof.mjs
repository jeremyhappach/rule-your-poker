// Local disposable PostgreSQL only; never uses hosted credentials or customer IDs.
import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const prior=JSON.parse(read('qualification.local/async-combined/review-context.json')).database;
if(!/^async_reviews_\d+$/.test(prior))throw Error('Expected local review fixture');
const database='async_finale_gate_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE '+prior);await root.end();
const db=await connect(database),peer=await connect(database),observer=await connect(database),checks=[];
const candidate=read('supabase/delayed/finale-review-gate.candidate.sql','utf8'),rules=JSON.parse(read('dev/async-combined/shared-preimage.json'));
const q=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows[0]?.v;
const as=async(who,c=db)=>c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[who]);
const pass=s=>{checks.push(s);console.log('PASS',s);};
const hashes=()=>q("SELECT jsonb_object_agg(n.nspname||'.'||p.proname,md5(pg_get_functiondef(p.oid))) v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN('settle_gameplay_chip_transfers','record_session_results','finalize_gameplay_transfer_batch','delayed_finalize','delayed_review_cleanup_eligible','delayed_prune_review_boards')");
const financial=id=>q(`SELECT jsonb_build_object(
 'receipt',(SELECT to_jsonb(s) FROM private.delayed_settlements s WHERE s.match_id=$1),
 'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE p.game_id=$1),
 'batches',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.gameplay_transfer_batches b WHERE b.game_id=$1),
 'results',(SELECT to_jsonb(r) FROM public.game_results r JOIN private.delayed_settlements s ON s.result_id=r.id WHERE s.match_id=$1),
 'accountWrites',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1)) v`,[id]);
const ack=(event,c=db)=>q('SELECT public.delayed_review_ack($1) v',[event],c);
const finale=(match,c=db)=>q('SELECT public.delayed_finale_ack($1) v',[match],c);
const home=id=>q('SELECT public.delayed_home($1) v',[id]);
const fails=async(fn,pattern)=>{await db.query('SAVEPOINT denied');try{await assert.rejects(fn,pattern);}finally{await db.query('ROLLBACK TO denied');}};
async function fixture(){
 const a=randomUUID(),b=randomUUID(),outside=randomUUID(),id=randomUUID(),children=[];
 for(const user of [a,b,outside]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true",[user,'Finale proof '+user.slice(0,8)]);}
 const lineup=[[1,'run21',1,rules.run21],[2,'tri-towers',5,rules.tri],[3,'quintzee',1,rules.quintzee]];
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,status,real_money,offer,offer_hash,accepted_at) VALUES($1,$2,$3,'active',false,$4,'local-proof',clock_timestamp())",[id,a,b,JSON.stringify(lineup.map(([,game,stake,config])=>({game,stake,config})))]);
 for(const [i,game,stake,config] of lineup){
  const child=randomUUID();children.push(child);
  await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,1,1,statement_timestamp(),statement_timestamp()+interval '24 hours',statement_timestamp()+interval '36 hours')",[child,id,i,game,stake,config,b]);
  // Synthetic completed attempts trigger the actual immutable review capture.
  await db.query('UPDATE private.delayed_children SET state=$2 WHERE id=$1',[child,{players:[a,b],attempts:[{actor:b,round:3,score:23100,at:Date.now(),board:{phase:'stage_complete',result:{score:23100},rules:config}}],totals:{[a]:30000,[b]:23100}}]);
 }
 const events={};
 for(const i of [2,0,1]){
  await q("SELECT private.delayed_record_outcome($1,1,'normal',$2,'{}') v",[children[i],i===1?b:a]);
  events[i]=(await db.query('SELECT id,kind FROM private.delayed_review_events WHERE child_id=$1',[children[i]])).rows;
 }
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await as(a);
 const attempt=i=>events[i].find(e=>e.kind==='attempt').id,child=i=>events[i].find(e=>e.kind==='child').id;
 await ack(attempt(2));await ack(child(2));
 return {a,b,outside,id,children,attempt,child};
}
try{
 const baseline=await hashes();
 const indexes=(await db.query("SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='private' AND tablename IN ('delayed_review_events','delayed_review_seen','delayed_finale_seen') ORDER BY tablename,indexname")).rows;
 assert(indexes.some(i=>i.tablename==='delayed_finale_seen'&&i.indexdef.includes('UNIQUE')));
 await db.query('BEGIN');
 const f=await fixture(),before=await financial(f.id);assert.equal(before.receipt.organizer_delta,-3);assert.equal(before.receipt.opponent_delta,3);assert.equal(before.batches.length,1);assert.equal(before.accountWrites,0);
 // Reproduce the old defect in this disposable fixture, before applying the guard.
 await finale(f.id);const oldSeen=await q('SELECT seen_at::text v FROM private.delayed_finale_seen WHERE match_id=$1 AND viewer=$2',[f.id,f.a]);
 await db.query(candidate);
 assert.equal((await home(f.id)).reviewsComplete,false);assert.equal((await home(f.id)).finaleViewed,true);
 await fails(()=>finale(f.id),/reviews_pending/);pass('premature historical finale ACK stays immutable and cannot bypass outstanding reviews');
 await ack(f.attempt(1));await ack(f.child(1));assert.equal((await home(f.id)).reviewsComplete,false);await fails(()=>finale(f.id),/reviews_pending/);
 assert.equal((await q('SELECT public.delayed_history_detail($1) v',[f.id])).reviewsComplete,false);pass('actual three-child ordering: Tri reviewed after Quintzee still leaves Run21 pending in home/history');
 await ack(f.child(0));assert.equal((await home(f.id)).reviewsComplete,false);await fails(()=>finale(f.id),/reviews_pending/);
 assert.equal(await q('SELECT private.delayed_review_cleanup_eligible(e) v FROM private.delayed_review_events e WHERE id=$1',[f.attempt(0)]),false);
 assert.equal(await q('SELECT count(*)::int v FROM private.delayed_review_boards WHERE event_id=$1',[f.attempt(0)]),1);pass('child ACK alone cannot bypass unseen attempt; snapshot remains retained and ineligible for cleanup');
 await as(f.outside);await fails(()=>finale(f.id),/not_found/);await fails(()=>home(f.id),/not_found/);
 await as(f.b);assert.equal((await home(f.id)).reviewsComplete,false);await fails(()=>finale(f.id),/reviews_pending/);await as(f.a);pass('per-viewer isolation and nonparticipant denial');
 await ack(f.attempt(0));await ack(f.attempt(0));assert.equal((await home(f.id)).reviewsComplete,true);
 await finale(f.id);await finale(f.id);assert.equal(await q('SELECT seen_at::text v FROM private.delayed_finale_seen WHERE match_id=$1 AND viewer=$2',[f.id,f.a]),oldSeen);
 assert.deepEqual(await financial(f.id),before);assert.deepEqual(await hashes(),baseline);pass('all reviews unlock finale; duplicate/late ACK preserves original receipt, canonical chips, balanced batch and final result');
 assert.equal(await q("SELECT has_function_privilege('anon','public.delayed_finale_ack(uuid)','EXECUTE') v"),false);
 assert.equal(await q("SELECT has_function_privilege('authenticated','public.delayed_finale_ack(uuid)','EXECUTE') v"),true);
 assert.equal(await q("SELECT has_function_privilege('authenticated','private.delayed_reviews_complete(uuid,uuid)','EXECUTE') v"),false);
 await db.query('SET LOCAL ROLE authenticated');await finale(f.id);await db.query('RESET ROLE');pass('authenticated RPC executes with unchanged authorization; private helper/anonymous access remain denied');
 await db.query(candidate);assert.equal((await home(f.id)).reviewsComplete,true);pass('candidate reapplies idempotently');
 await db.query('ROLLBACK');assert.equal(await q('SELECT count(*)::int v FROM private.delayed_matches WHERE id=$1',[f.id]),0);assert.equal(await q("SELECT to_regprocedure('private.delayed_reviews_complete(uuid,uuid)')::text v"),null);pass('complete candidate proof rolls back fixtures, financial records and DDL');
 // Install only in our disposable clone, then test independent committed connections.
 await db.query(candidate);await db.query('BEGIN');const race=await fixture();await ack(race.attempt(1));await ack(race.child(1));await ack(race.child(0));await db.query('COMMIT');
 const raceBefore=await financial(race.id);await as(race.a,peer);await as(race.a,observer);
 await assert.rejects(()=>finale(race.id,peer),/reviews_pending/);
 await db.query('BEGIN');await ack(race.attempt(0));
 const waiting=finale(race.id,peer);let blocked=false;
 for(let i=0;i<100;i++){if(await q('SELECT cardinality(pg_blocking_pids($1))>0 v',[peer.processID],observer)){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}
 assert(blocked,'finale waits on the same parent lock as the last child attempt ACK');await db.query('COMMIT');await waiting;
 await Promise.all([finale(race.id,db),finale(race.id,peer),ack(race.attempt(0),observer)]);
 assert.equal(await q('SELECT count(*)::int v FROM private.delayed_finale_seen WHERE match_id=$1 AND viewer=$2',[race.id,race.a]),1);
 assert.deepEqual(await financial(race.id),raceBefore);assert.deepEqual(await hashes(),baseline);pass('independent-tab race: early finale rejected; queued finale sees committed final review; concurrent duplicates create one ACK and zero financial changes');
 write('qualification.local/async-combined/finale-gate-proof.json',JSON.stringify({passed:true,database,checks,indexes,unchangedHashes:baseline,scope:'local clone only; no hosted migration or customer mutation'},null,2));
}finally{
 await db.query('ROLLBACK');await Promise.all([db.end(),peer.end(),observer.end()]);
 const cleanup=await connect('postgres');try{if(!/^async_finale_gate_\d+$/.test(database))throw Error('Unsafe disposable database name');await cleanup.query('DROP DATABASE '+database);}finally{await cleanup.end();}
}
