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
 await c.query('BEGIN');await c.query("set local statement_timeout='15s'");
 await c.query(body(read('supabase/eleven-up/human-ready.sql','utf8')));
 if(process.argv.includes('--smoke-controls'))await c.query(body(read('supabase/eleven-up/smoke-controls.sql','utf8')));
 for(const real of [true,false]){
  const f=await fixture(real),before=await match(f);
  await service();await c.query('select private.eleven_up_recover()');
  let m=await match(f),g=await q('select * from public.games where id=$1',[f.game]);
  assert.equal(m.state.phase,real?'ready':'playing');if(real)assert.deepEqual(m.state.scores,before.state.scores);assert.deepEqual(m.state.stages,before.state.stages);
  assert.equal(g.is_paused,real);
  let p=await q('select * from public.players where id=$1',[f.active]);assert.equal(!!p.auto_fold,!real);assert.equal(!!p.sit_out_next_hand,!real);assert.equal(p.sitting_out,false);
  if(real){
   assert(m.paused_at!==null,'canonical 11 Up pause trigger froze Ready');
   assert(Number(g.pause_version)>0,'canonical pause version advanced');
   await c.query('select public.set_game_paused($1,false,$2,$3)',[f.game,f.id,g.pause_version]);
   m=await match(f);assert.equal(m.paused_at,null);assert(Number(m.state.deadline)>Date.now());
   evidence.push('real Ready pauses without score/advance; canonical resume retains Ready allowance');
  }else{
   await actor(f.user);
   let snap=(await q('select public.eleven_up_snapshot($1) v',[f.id])).v;
   assert(snap.players.find(p=>p.id===f.active).autoplay);assert(!snap.canAct);
   await rejects("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),m.revision],/inactive_autoplay/);
   await c.query('select pg_sleep(0.8)');await service();await c.query('select private.eleven_up_recover()');
   m=await match(f);assert.equal(m.state.phase,'playing');assert(m.state.groups>0||m.state.cursor>before.state.cursor);
   const deadline=m.state.deadline,started=m.state.startedAt;
   await actor(f.user);await c.query('set local role authenticated');
   snap=(await q('select public.eleven_up_reclaim($1,$2) v',[f.id,m.revision])).v;
   await c.query('reset role');assert(snap.canAct);assert(!snap.players.find(p=>p.id===f.active).autoplay);
   p=await q('select * from public.players where id=$1',[f.active]);assert(!p.sit_out_next_hand&&!p.auto_fold);
   const reclaimed=await match(f);assert.equal(reclaimed.bot_due_at,null);assert.equal(reclaimed.state.deadline,deadline);assert.equal(reclaimed.state.startedAt,started);
   await service();await c.query('select pg_sleep(0.8)');await c.query('select private.eleven_up_recover()');assert.deepEqual((await match(f)).state,reclaimed.state);
   await actor(f.user);await rejects("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),m.revision],/stale_revision/);
   evidence.push('fake Ready strategic takeover; snapshot persistence; reclaim clears flags/due time; stale action rejected; scoring clock unchanged');
  }
  // Both modes retain the exact active scoring reducer, including disconnected expiry.
  await actor(f.user);m=await match(f);
  if(m.state.phase==='ready')await c.query("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),m.revision]);
  await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[f.id,Date.now()-10]);
  m=await match(f);const expected=(await q("select private.eleven_up_reduce($1::jsonb,'tick',null,$2) v",[JSON.stringify(m.state),m.state.deadline])).v;
  await service();await c.query('select private.eleven_up_recover()');assert.deepEqual((await match(f)).state,expected);
  assert.equal((await q('select is_paused from public.games where id=$1',[f.game])).is_paused,false);
  evidence.push((real?'real':'fake')+' scoring expiry matches unchanged reducer exactly');
 }
 for(const real of [true,false]){
  const late=await fixture(real);await actor(late.user);const lm=await match(late);
  await c.query("select public.eleven_up_action($1,$2,$3,'pass',null)",[late.id,uuid(),lm.revision]);
  assert.equal((await match(late)).state.phase,real?'ready':'playing');assert.equal((await q('select is_paused from public.games where id=$1',[late.game])).is_paused,real);
 }
 evidence.push('late human RPC uses the same Ready timeout boundary in both money modes');
 const denied=await fixture(false),deniedMatch=await match(denied);await actor(uuid());
 await rejects('select public.eleven_up_reclaim($1,$2)',[denied.id,deniedMatch.revision],/participant_required/);
 await c.query('set local role anon');await rejects('select public.eleven_up_reclaim($1,$2)',[denied.id,deniedMatch.revision],/permission denied/);await c.query('reset role');
 assert.equal((await match(denied)).revision,deniedMatch.revision);
 evidence.push('nonmember and anonymous reclaim rejected without state changes');
 const all=await fixture(false);
 await c.query("update public.game_defaults set timeout_enforcement_enabled=false,timeout_action='none' where game_type='eleven-up'");
 await c.query("update public.games set timeout_enforcement_enabled=null,timeout_action=null where id=$1",[all.game]);
 await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where game_id=$1 and id<>$2',[all.game,all.active]);
 await service();await c.query('select private.eleven_up_recover()');
 assert.equal((await q('select is_paused from public.games where id=$1',[all.game])).is_paused,true);
 let paused=await match(all);assert.equal(paused.state.phase,'ready');
 await actor(all.user);await c.query('set local role authenticated');
 await c.query('select public.eleven_up_reclaim($1,$2)',[all.id,paused.revision]);await c.query('reset role');
 assert.equal((await q('select is_paused from public.games where id=$1',[all.game])).is_paused,true);
 assert.equal((await match(all)).state.deadline,paused.state.deadline);
 assert.equal((await q('select auto_fold or sit_out_next_hand as flags from public.players where id=$1',[all.active])).flags,false);
 evidence.push('inherited production false/none defaults still pause all humans at Ready; paused reclaim clears flags without resume or clock shift');
 const explicit=await fixture(false);
 await c.query("update public.games set timeout_enforcement_enabled=false,timeout_action='none' where id=$1",[explicit.game]);
 await c.query('update public.players set auto_fold=true where game_id=$1',[explicit.game]);
 await service();
 assert.equal((await q('select private.pause_all_humans_auto_fold($1) v',[explicit.game])).v,true);
 assert.equal((await match(explicit)).state.phase,'ready');
 evidence.push('explicit false/none policy also honors canonical Ready all-human safeguard');
 const boundary=await fixture(false);
 await service();await c.query('select private.eleven_up_recover()');
 assert.equal((await q('select sitting_out from public.players where id=$1',[boundary.active])).sitting_out,false);
 const bm=await match(boundary),totals=Object.fromEntries(bm.state.players.map((p,i)=>[p.id,i?0:100]));
 await c.query("update private.eleven_up_matches set state=state||jsonb_build_object('phase','complete','scores',$2::jsonb,'turnIndex',3) where dealer_game_id=$1",[boundary.id,JSON.stringify(totals)]);
 await c.query('select private.eleven_up_settle($1)',[boundary.id]);await actor(boundary.user);
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{terminal,deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[boundary.id,Date.now()-1]);
 await c.query('select public.eleven_up_close($1)',[boundary.id]);
 const bp=await q('select sitting_out,auto_fold,sit_out_next_hand from public.players where id=$1',[boundary.active]);assert(bp.sitting_out&&!bp.auto_fold&&!bp.sit_out_next_hand);
 evidence.push('sit-out deferred through competition; canonical close excludes player from next-game eligibility and clears transient flags');
 const deferred=await fixture(false);await service();await c.query('select private.eleven_up_recover()');
 let dm=await match(deferred);assert.equal(dm.state.phase,'playing');
 await c.query("update public.games set timeout_enforcement_enabled=true,timeout_action='auto_fold' where id=$1",[deferred.game]);
 await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where game_id=$1',[deferred.game]);
 assert.equal((await q('select private.pause_all_humans_auto_fold($1) v',[deferred.game])).v,false);
 await c.query('select private.eleven_up_recover()');
 assert.equal((await q('select is_paused from public.games where id=$1',[deferred.game])).is_paused,false);
 assert.equal((await match(deferred)).state.deadline,dm.state.deadline);
 for(let i=0;i<3;i++){
  await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[deferred.id,Date.now()-1]);
  await c.query('select private.eleven_up_recover()');
 }
 dm=await match(deferred);assert.equal(dm.state.phase,'ready');
 await c.query('select pg_sleep(0.8)');await c.query('select private.eleven_up_recover()');
 assert.equal((await q('select is_paused from public.games where id=$1',[deferred.game])).is_paused,true);
 evidence.push('all-human inactivity does not freeze active scoring; safeguard applies at next Ready boundary');
 const legacy=await fixture(false);await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where id=$1',[legacy.active]);
 const baseline=JSON.parse(read('qualification.local/eleven-up-timeout/baseline.json','utf8'));
 await c.query(baseline.find(f=>f.proname==='eleven_up_snapshot').definition);await actor(legacy.user);
 const oldProjection=(await q('select public.eleven_up_snapshot($1) v',[legacy.id])).v;
 await c.query(body(read('supabase/eleven-up/human-ready.sql','utf8')));
 const newProjection=(await q('select public.eleven_up_snapshot($1) v',[legacy.id])).v;
 assert(newProjection.revision>oldProjection.revision);assert(!newProjection.canAct);assert(newProjection.players.find(p=>p.id===legacy.active).autoplay);
 const unchangedRevision=newProjection.revision;await c.query(body(read('supabase/eleven-up/human-ready.sql','utf8')));assert.equal(Number((await match(legacy)).revision),Number(unchangedRevision));
 evidence.push('existing flagged match installs at a new revision; repeat install does not mutate it again');
 // Full existing money matrix: actual triggers, winners/ties, replay, rollback.
 const matrix=read('supabase/multiplayer-money/matrix.sql','utf8').replaceAll('__FAMILY__','eleven_up').replaceAll('__GAME__','eleven-up');
 await c.query(matrix);evidence.push('36 both-money financial cases, canonical ledger/snapshots, injected failure and duplicate settlement');
 await c.query('ROLLBACK');
 // Independent connections exercise the real row locks and CAS, not mocks.
 await c.query('BEGIN');const race=await fixture(false);await c.query('COMMIT');
 await c.query('BEGIN');await service();await c.query('select private.eleven_up_recover()');await c.query('COMMIT');
 let rm=await match(race);await c.query('select pg_sleep(greatest(0,($1::bigint-extract(epoch from clock_timestamp())*1000)/1000)+0.05)',[rm.bot_due_at]);
 const second=await connect(context().database);
 try{
  await c.query('BEGIN');await c.query('select 1 from public.rounds where id=$1 for update',[rm.round_id]);
  await second.query('BEGIN');await second.query("select set_config('request.jwt.claim.sub',$1,true)",[race.user]);
  const blocked=second.query('select public.eleven_up_reclaim($1,$2)',[race.id,rm.revision]).then(()=>({ok:true}),e=>({error:e.message}));
  await c.query('select private.eleven_up_recover()');await c.query('COMMIT');
  assert.match((await blocked).error,/stale_revision/);await second.query('ROLLBACK');
  const botWon=await match(race);assert.equal(botWon.state.phase,'playing');
  await c.query('BEGIN');await actor(race.user);await c.query('select 1 from public.rounds where id=$1 for update',[botWon.round_id]);
  await c.query('select public.eleven_up_reclaim($1,$2)',[race.id,botWon.revision]);
  await second.query('select private.eleven_up_recover()');await c.query('COMMIT');
  const reclaimed=await match(race);await second.query('select private.eleven_up_recover()');assert.deepEqual((await match(race)).state,reclaimed.state);assert.equal(reclaimed.bot_due_at,null);
  evidence.push('independent-connection bot/reclaim races: bot-first stale reclaim rejected; retry succeeds; reclaim-first blocks/skips bot without duplicate action');
 }finally{await second.end();}
 write('qualification.local/eleven-up-timeout/proof.json',JSON.stringify({database:context().database,evidence},null,2));console.log(evidence);
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
