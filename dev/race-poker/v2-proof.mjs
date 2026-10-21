import {connect,localContext} from './database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
const c=await connect(localContext().database);
const q=async(sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
const get=d=>q('SELECT to_jsonb(m) v FROM private.race_poker_matches m WHERE dealer_game_id=$1',[d]);
const auth=u=>q("SELECT set_config('request.jwt.claim.sub',$1,true) v",[u]);
async function fixture(real=false){
 const u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
 for(let i=0;i<2;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Race v2 '+u[i]]);}
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',$2,2,$3,0,false,false,$4)",[g,real,offer,u[0]]);
 for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p[i],g,u[i],2-i]);
 await auth(u[0]);const config=await q("SELECT public.race_poker_configure($1,$2,2,'race-poker','{\"ante_amount\":5}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await auth(u[1]);await q("SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p[1]]);await q('SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 const m=await get(d),actor=m.state.players[m.state.turnIndex];await auth(actor.userId);return {g,d,p,u,actor};
}
const action=async(f,type,items,request=uuid())=>{const m=await get(f.d);return q('SELECT public.race_poker_action($1,$2,$3,$4,$5) v',[f.d,request,m.revision,type,items]);};
async function rejects(call,pattern){await c.query('SAVEPOINT expected_rejection');try{await assert.rejects(call,pattern);}finally{await c.query('ROLLBACK TO SAVEPOINT expected_rejection');await c.query('RELEASE SAVEPOINT expected_rejection');}}
const expire=d=>c.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=$1",[d]);
try{
 await c.query('BEGIN');for(const f of ['canonical-control-dependencies','canonical-controls'])await c.query(readFileSync('dev/race-poker/'+f+'.fixture.sql','utf8'));await c.query(readFileSync('supabase/race-poker/v2.sql','utf8'));
 for(const file of ['core-proof','financial-proof','rollback-failure-proof'])await c.query(readFileSync('supabase/race-poker/'+file+'.sql','utf8'));
 const f=await fixture();await action(f,'choose',[0]);const hand=(await get(f.d)).state.hand;
 await expire(f.d);const expiredDeadline=(await get(f.d)).state.deadline;await action(f,'autoplay',[0]);assert.equal((await get(f.d)).state.deadline,expiredDeadline);await q('SELECT private.race_poker_recover() v');
 let m=await get(f.d),p=await q('SELECT to_jsonb(p) v FROM public.players p WHERE id=$1',[f.actor.id]);
 assert.equal(p.auto_fold,true);assert.equal(p.sit_out_next_hand,true);assert.deepEqual(m.state.hand,hand);assert.equal(m.state.phase,'playing');
 let snap=await q('SELECT public.race_poker_snapshot($1) v',[f.d]);assert.equal(snap.canAct,false);assert.equal(snap.automaticPlayers[f.actor.id],true);assert.equal(snap.deck,undefined);
 await rejects(()=>action(f,'choose',[0]),/autoplay_active/);
 await c.query('UPDATE private.race_poker_matches SET bot_due_at=0 WHERE dealer_game_id=$1',[f.d]);await q('SELECT private.race_poker_recover() v');assert.equal((await get(f.d)).state.hand.length,2);
 const request=uuid(),before=await get(f.d),receipt=await action(f,'autoplay',[0],request);
 assert.deepEqual(await q("SELECT public.race_poker_action($1,$2,$3,'autoplay',ARRAY[0]) v",[f.d,request,before.revision]),receipt);
 p=await q('SELECT to_jsonb(p) v FROM public.players p WHERE id=$1',[f.actor.id]);assert.equal(p.auto_fold,false);assert.equal(p.sit_out_next_hand,false);
 m=await get(f.d);assert.equal(m.bot_due_at,null);assert.ok(m.state.deadline-Date.now()>29000);
 snap=await q('SELECT public.race_poker_snapshot($1) v',[f.d]);assert.equal(snap.canAct,true);assert.equal(snap.automaticPlayers[f.actor.id],false);
 const peer=m.state.players.find(p=>p.id!==f.actor.id);await auth(peer.userId);await action(f,'autoplay',[1]);await action(f,'autoplay',[0]);
 await auth(uuid());await rejects(()=>action(f,'autoplay',[0]),/participant_required/);await auth(f.actor.userId);
 await action(f,'choose',[0]);assert.equal((await get(f.d)).state.hand.length,3);
 console.log('PASS fake timeout, public projection/reconnect, bot choice, immutable retry, immediate reclaim, opponent-turn toggle and authorization');
 // Reclaim clears canonical next-hand participation intent, including at continuation.
 await c.query("UPDATE private.race_poker_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object($2::text,50000,$3::text,40000)) WHERE dealer_game_id=$1",[f.d,f.p[0],f.p[1]]);
 await q('SELECT private.race_poker_settle($1) v',[f.d]);
 await c.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1",[f.d]);await q('SELECT private.race_poker_recover() v');
 assert.equal(await q('SELECT bool_and(NOT sitting_out AND NOT auto_fold AND NOT sit_out_next_hand) v FROM public.players WHERE game_id=$1',[f.g]),true);
 // Legacy admissions retain zero-point expiry under the upgraded executor.
 const currentRules=await q("SELECT pg_get_functiondef('private.race_poker_rules()'::regprocedure) v");
 await c.query("CREATE OR REPLACE FUNCTION private.race_poker_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT private.race_poker_rules_v1() $$");
 const legacy=await fixture();await c.query(currentRules);await expire(legacy.d);await q('SELECT private.race_poker_recover() v');
 assert.equal((await get(legacy.d)).state.result.reason,'timeout');assert.equal((await get(legacy.d)).state.result.points,0);
 // Real-money timeout uses canonical pause, retains cards and rearms only on resume.
 const real=await fixture(true);await action(real,'choose',[1]);const original=(await get(real.d)).state.hand;
 await expire(real.d);await q('SELECT private.race_poker_recover() v');m=await get(real.d);
 assert.ok(m.paused_at);assert.deepEqual(m.state.hand,original);assert.ok(m.state.deadline-Number(m.paused_at)>29000&&m.state.deadline-Number(m.paused_at)<=30000);
 p=await q('SELECT to_jsonb(p) v FROM public.players p WHERE id=$1',[real.actor.id]);assert.equal(p.auto_fold,false);assert.equal(p.sit_out_next_hand,false);
 await auth(real.u[0]);const game=await q('SELECT to_jsonb(g) v FROM public.games g WHERE id=$1',[real.g]);
 const resume=await q('SELECT public.set_game_paused($1,false,$2,$3) v',[real.g,real.d,game.pause_version]);assert.equal(resume.outcome,'resumed');assert.equal((await get(real.d)).paused_at,null);
 await auth(real.actor.userId);await action(real,'choose',[0]);assert.equal((await get(real.d)).state.hand.length,2);
 console.log('PASS real-money canonical pause/resume and legacy v1 preservation');
 // No clients: both fake-money humans enter autoplay and reach canonical settlement.
 const unattended=await fixture();
 for(let i=0;i<260;i++){
  m=await get(unattended.d);if(m.settlement!==null)break;
  if(m.bot_due_at!==null)await c.query('UPDATE private.race_poker_matches SET bot_due_at=0 WHERE dealer_game_id=$1',[unattended.d]);else await expire(unattended.d);
  await q('SELECT private.race_poker_recover() v');
 }
 m=await get(unattended.d);assert.ok(m.settlement);assert.equal(m.state.phase,'complete');
 assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[unattended.d]),1);
 assert.equal(await q('SELECT sum(chips)::int v FROM public.players WHERE game_id=$1',[unattended.g]),200);
 await c.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1",[unattended.d]);await q('SELECT private.race_poker_recover() v');
 assert.equal((await get(unattended.d)).finished,true);
 assert.equal(await q('SELECT bool_and(sitting_out AND NOT auto_fold AND NOT sit_out_next_hand) v FROM public.players WHERE game_id=$1',[unattended.g]),true);
 console.log('PASS zero-client strategic completion, canonical settlement and next-dealer-game sit-out');
 await c.query('ROLLBACK');writeFileSync('qualification.local/race-poker/v2-proof.json',JSON.stringify({passed:true,at:new Date().toISOString()}));
}catch(e){console.error(e.message,e.where);await c.query('ROLLBACK');process.exitCode=1;}finally{await c.end();}
