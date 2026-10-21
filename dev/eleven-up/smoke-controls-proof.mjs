import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,context,body} from './human-ready-local.mjs';
const c=await connect(context().database),evidence=[];
const q=async(sql,args=[])=>(await c.query(sql,args)).rows[0];
const actor=async u=>c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[u,JSON.stringify({sub:u,role:'authenticated'})]);
const service=async()=>c.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
const match=async f=>q('select * from private.eleven_up_matches where dealer_game_id=$1',[f.id]);
async function rejects(sql,args,re){await c.query('savepoint rejection');try{await assert.rejects(()=>c.query(sql,args),re);}finally{await c.query('rollback to rejection');}}
async function fixture(real){
 await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
 const f={game:uuid(),users:[uuid(),uuid(),uuid()],players:[uuid(),uuid(),uuid()]};
 for(const u of f.users){await c.query('insert into auth.users(id) values($1)',[u]);await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[u,'Ready '+u]);}
 await c.query("insert into public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) values($1,'game_selection',$2,3,clock_timestamp()+interval '10 minutes',0,false,false,$3)",[f.game,real,f.users[0]]);
 for(let i=0;i<3;i++)await c.query("insert into public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting) values($1,$2,$3,$4,100,false,'active',false,false)",[f.players[i],f.game,f.users[i],3-i]);
 const deadline=(await q('select config_deadline::text from public.games where id=$1',[f.game])).config_deadline;
 await actor(f.users[0]);await c.query('set local role authenticated');
 f.id=(await q("select public.eleven_up_configure($1,$2,3,'eleven-up','{\"ante_amount\":7}',$3) v",[f.game,f.players[0],deadline])).v.dealer_game.id;
 await c.query('reset role');
 for(let i=1;i<3;i++){await actor(f.users[i]);await c.query('set local role authenticated');await c.query("select public.submit_ante_decision($1,$2,$3,'ante_up')",[f.game,f.id,f.players[i]]);await c.query('reset role');}
 const m=await match(f);f.active=m.state.players[m.state.turnIndex].id;f.user=f.users[f.players.indexOf(f.active)];
 await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 where dealer_game_id=$1",[f.id]);
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[f.id,Date.now()-100]);
 return f;
}
try{
 await c.query('BEGIN');await c.query("set local statement_timeout='20s'");
 const baseline=(await c.query("select oid,pg_get_functiondef(oid) definition from pg_proc where proname in ('eleven_up_reduce','eleven_up_board_reduce','eleven_up_settle') or proname like 'race_poker%' ")).rows;
 await c.query(body(read('supabase/eleven-up/smoke-controls.sql','utf8')));
 for(const real of [false,true])for(const lateAction of [false,true]){
  const f=await fixture(real);await actor(f.user);
  // Start normally before the Ready allowance ends, then expire gameplay.
  await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[f.id,Date.now()+30000]);
  let m=await match(f);await c.query("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),m.revision]);
  await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[f.id,Date.now()-10]);
  m=await match(f);const roster=m.state.players,expired=m.state.deadline;
  const expected=(await q("select private.eleven_up_reduce($1,'tick',null,$2) v",[m.state,expired])).v;
  if(lateAction)await c.query("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),m.revision]);
  else{await service();await c.query('select private.eleven_up_recover()');}
  m=await match(f);assert.deepEqual(m.state,expected);assert.equal(m.state.result.completedAt,expired);
  assert.equal(m.state.result.score,0);assert.equal(m.state.result.reason,'timeout');
  assert.equal((await q('select is_paused from public.games where id=$1',[f.game])).is_paused,false);
  let player=await q('select * from public.players where id=$1',[f.active]);assert(player.auto_fold&&player.sit_out_next_hand&&!player.sitting_out);
  await actor(f.user);let snap=(await q('select public.eleven_up_snapshot($1) v',[f.id])).v;
  assert(snap.players.find(p=>p.id===f.active).autoplay,'reload projects away control');
  // Play other participants legally, preserving the schedule through round two.
  for(let steps=0;steps<30;steps++){
   m=await match(f);if(m.state.stage===2&&m.state.players[m.state.turnIndex].id===f.active&&m.state.phase==='ready')break;
   if(real&&lateAction&&m.state.stage===2&&m.state.players[m.state.turnIndex].id===f.active&&m.state.phase==='intro'){
    await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[f.id,Date.now()-40000]);m=await match(f);
   }
   const at=m.state.phase==='ready'?m.state.deadline-1:m.state.phase==='playing'?m.state.startedAt+1:m.state.deadline;
   const action=m.state.phase==='ready'?'pass':m.state.phase==='playing'?'take_score':'tick';
   await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,$2,null,$3),revision=revision+1 where dealer_game_id=$1",[f.id,action,at]);
  }
  m=await match(f);assert.equal(m.state.stage,2);assert.equal(m.state.phase,'ready');assert.deepEqual(m.state.players,roster);
  assert.equal(m.state.stages.filter(s=>s.playerId===f.active).length,1,'no replacement round scores');
  const paused=(await q('select is_paused from public.games where id=$1',[f.game])).is_paused;assert.equal(paused,real);
  if(real){assert(m.paused_at);assert.equal(m.bot_due_at,null);if(lateAction)assert(m.state.deadline>Date.now(),'late Ready catch-up retains its canonical pre-play allowance');}
  else{
   assert(m.bot_due_at);await service();await c.query('select pg_sleep(0.8)');await c.query('select private.eleven_up_recover()');
   m=await match(f);assert.equal(m.state.phase,'playing');assert(m.state.groups>0||m.state.cursor>23);
  }
  await actor(f.user);const before=m.state,rev=m.revision;
  await c.query('set local role authenticated');snap=(await q('select public.eleven_up_reclaim($1,$2) v',[f.id,rev])).v;await c.query('reset role');
  assert(!snap.players.find(p=>p.id===f.active).autoplay);m=await match(f);assert.deepEqual(m.state,before);assert.equal(m.bot_due_at,null);
  player=await q('select * from public.players where id=$1',[f.active]);assert(!player.auto_fold&&!player.sit_out_next_hand&&!player.sitting_out);
  assert.equal((await q('select is_paused from public.games where id=$1',[f.game])).is_paused,real,'reclaim does not resume');
  await rejects("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),rev],real?/inactive/:/stale_revision/);
  evidence.push(`${real?'real':'fake'} ${lateAction?'late RPC':'scheduler'} expiry: exact zero/result, flags/reload, normal next-round schedule, ${real?'pause':'bot takeover'}, reclaim and stale rejection`);
 }
 // Reclaim after expiry but BEFORE next round prevents real-money away pause.
 const early=await fixture(true);await actor(early.user);let em=await match(early);
 await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),'pass',null,$3),revision=revision+1 where dealer_game_id=$1",[early.id,Date.now()+30000,Date.now()]);
 em=await match(early);await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 where dealer_game_id=$1",[early.id]);
 em=await match(early);await c.query('select public.eleven_up_reclaim($1,$2)',[early.id,em.revision]);
 assert.equal((await q('select auto_fold from public.players where id=$1',[early.active])).auto_fold,false);
 for(let steps=0;steps<30;steps++){
  em=await match(early);if(em.state.stage===2&&em.state.players[em.state.turnIndex].id===early.active&&em.state.phase==='ready')break;
  const at=em.state.phase==='ready'?em.state.deadline-1:em.state.phase==='playing'?em.state.startedAt+1:em.state.deadline;
  await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,$2,null,$3),revision=revision+1 where dealer_game_id=$1",[early.id,em.state.phase==='ready'?'pass':em.state.phase==='playing'?'take_score':'tick',at]);
 }
 assert.equal((await match(early)).state.stage,2);assert.equal((await q('select is_paused from public.games where id=$1',[early.game])).is_paused,false);
 evidence.push('reclaim before the next real-money Ready phase prevents away pause');
 // A two-ball group waits 1500ms for presentation; the gameplay clock is untouched.
 const paced=await fixture(false);await actor(paced.user);
 let pm=await match(paced);const slots=Array(22).fill(null);slots[0]=16;slots[9]=20;
 await c.query("update private.eleven_up_matches set state=state||jsonb_build_object('phase','playing','startedAt',$2::bigint,'deadline',$3::bigint,'slots',$4::jsonb,'current',44) where dealer_game_id=$1",[paced.id,Date.now()-1000,Date.now()+10000,JSON.stringify(slots)]);
 await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where id=$1',[paced.active]);
 pm=await match(paced);const deadline=pm.state.deadline,start=Date.now();
 await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,'group',ARRAY[16,44],$2),revision=revision+1 where dealer_game_id=$1",[paced.id,Date.now()]);
 pm=await match(paced);assert(pm.bot_due_at>=start+1500);assert.equal(pm.state.deadline,deadline);
 const pacedRevision=pm.revision;await service();await c.query('select private.eleven_up_recover()');assert.equal((await match(paced)).revision,pacedRevision);
 // Expiry wins even when a presentation-paced bot due time is in the future.
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[paced.id,Date.now()-1]);
 await c.query('select private.eleven_up_recover()');const timed=await match(paced);assert.equal(timed.state.result.reason,'timeout');assert(timed.state.result.score>0,'earned points are not replaced by zero');
 evidence.push('750ms per selected ball paces bot decisions; unchanged scoring deadline preempts presentation delay');
 // Full financial regressions with the new trigger installed.
 await c.query(read('supabase/multiplayer-money/matrix.sql','utf8').replaceAll('__FAMILY__','eleven_up').replaceAll('__GAME__','eleven-up'));
 for(const f of baseline)assert.equal((await q('select pg_get_functiondef($1::oid) v',[f.oid])).v,f.definition);
 evidence.push('36 financial cases pass; reducers, settlement and every Race function unchanged');
 await c.query('ROLLBACK');write('qualification.local/eleven-up-timeout/smoke-controls-proof.json',JSON.stringify({evidence},null,2));console.log(evidence);
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
