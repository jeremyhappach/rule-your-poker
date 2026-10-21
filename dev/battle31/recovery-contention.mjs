import {installReleasedBaseline} from './released-baseline.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {connect,candidate} from './database.mjs';
import {fixture} from './fixture.mjs';

// Disposable, loopback-only database; never use production credentials or fixtures.
const database='battle31_recovery_'+Date.now(), admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE money_qualification_1792441147994');
await admin.end();
const c=await connect(database),locker=await connect(database),other=await connect(database);
const results=[];
const state=async id=>(await c.query('SELECT * FROM private.battle31_matches WHERE dealer_game_id=$1',[id])).rows[0];
async function recover(client=c){const started=performance.now();await client.query('SELECT private.battle31_recover()');return Math.round(performance.now()-started);}
async function boxdrop(real,users){
 const game=randomUUID(),players=[randomUUID(),randomUUID()],deadline=new Date(Date.now()+600000).toISOString();
 await c.query('UPDATE private.boxdrop_release SET enabled=true,admission_enabled=true');
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$2,2,$3,0,false,false)",[game,real,deadline]);
 for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],game,users[i],2-i]);
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]]);
 const id=(await c.query("SELECT public.boxdrop_configure($1,$2,2,'boxdrop','{\"ante_amount\":5}',$3) v",[game,players[0],deadline])).rows[0].v.dealer_game.id;
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[1]]);
 await c.query("SELECT public.submit_ante_decision($1,$2,$3,'ante_up')",[game,id,players[1]]);
 await c.query('SELECT public.advance_ante_phase($1,$2)',[game,id]);
 await c.query("UPDATE private.boxdrop_matches SET state=state||jsonb_build_object('phase','playing','deadline',0) WHERE dealer_game_id=$1",[id]);
 return id;
}
try{
 await c.query('BEGIN');
 for(const name of ['rules','multiplayer','arcade','bots','recovery'])await c.query(readFileSync('supabase/boxdrop/'+name+'.sql','utf8'));
 await installReleasedBaseline(c);await c.query(candidate());await c.query('COMMIT');
 for(const client of [c,other])await client.query("SET statement_timeout='1500ms'");
 for(const real of [false,true]){
  const fixtures=[];
  for(let i=0;i<42;i++)fixtures.push(await fixture(real,false,database));
  const ids=fixtures.map(f=>f.id);
  await c.query("UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','intro','turn',1,'turnIndex',0,'closing',false,'hands','[[0,1,10],[16,17,26]]'::jsonb,'center','[2,11,20]'::jsonb,'deadline',1) WHERE dealer_game_id=ANY($1::uuid[])",[ids]);
  await c.query("UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','intro','deadline',0) WHERE dealer_game_id=ANY($1::uuid[])",[ids.slice(0,21)]);
  const box=await boxdrop(real,fixtures[0].users);
  await c.query("SELECT set_config('request.jwt.claim.sub','',false)");
  const boxBefore=(await c.query('SELECT revision FROM private.boxdrop_matches WHERE dealer_game_id=$1',[box])).rows[0].revision;
  await locker.query('BEGIN');
  await locker.query('SELECT r.id FROM public.rounds r JOIN private.battle31_matches m ON m.round_id=r.id WHERE m.dealer_game_id=ANY($1::uuid[]) FOR UPDATE OF r',[ids.slice(0,21)]);
  const elapsed=await recover();
  let rows=(await c.query('SELECT dealer_game_id,revision FROM private.battle31_matches WHERE dealer_game_id=ANY($1::uuid[])',[ids])).rows;
  assert.equal(rows.filter(r=>Number(r.revision)===1).length,20,'20 locked-front rows must not hide healthy sessions');
  assert(rows.filter(r=>ids.slice(0,21).includes(r.dealer_game_id)).every(r=>Number(r.revision)===0));
  await recover();
  assert.equal((await c.query('SELECT count(*)::int n FROM private.battle31_matches WHERE dealer_game_id=ANY($1::uuid[]) AND revision=1',[ids])).rows[0].n,21);
  // A different game's real recovery owner must progress while Battle locks remain held.
  await other.query('SELECT private.boxdrop_recover()');
  assert(Number((await c.query('SELECT revision FROM private.boxdrop_matches WHERE dealer_game_id=$1',[box])).rows[0].revision)>Number(boxBefore));
  await locker.query('ROLLBACK');
  await c.query('UPDATE private.battle31_matches SET paused_at=0 WHERE dealer_game_id=ANY($1::uuid[])',[ids]);
  // All lock classes, plus a healthy tail, under the same 1.5-second deadline.
  const small=fixtures.slice(0,4),smallIds=small.map(f=>f.id);
  await c.query('UPDATE private.battle31_matches SET paused_at=NULL WHERE dealer_game_id=ANY($1::uuid[])',[smallIds]);
  await locker.query('BEGIN');
  await locker.query('SELECT id FROM public.games WHERE id=$1 FOR UPDATE',[small[0].game]);
  await locker.query('SELECT dealer_game_id FROM private.battle31_matches WHERE dealer_game_id=$1 FOR UPDATE',[small[1].id]);
  await locker.query('SELECT id FROM public.players WHERE game_id=$1 FOR UPDATE',[small[2].game]);
  await recover();
  for(const f of small.slice(0,3))assert.equal(Number((await state(f.id)).revision),0);
  assert.equal(Number((await state(small[3].id)).revision),1);
  await locker.query('ROLLBACK');
  // More player-only locks than the batch size must not starve healthy work.
  await c.query('UPDATE private.battle31_matches SET paused_at=0 WHERE dealer_game_id=ANY($1::uuid[])',[ids]);
  await c.query('UPDATE private.battle31_matches SET paused_at=NULL WHERE dealer_game_id=ANY($1::uuid[])',[ids.slice(0,22)]);
  await c.query("UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','intro','deadline',0) WHERE dealer_game_id=ANY($1::uuid[])",[ids.slice(0,22)]);
  const playerLockRevisions=[];for(const f of fixtures.slice(0,22))playerLockRevisions.push(await state(f.id));
  await locker.query('BEGIN');
  await locker.query('SELECT id FROM public.players WHERE game_id=ANY($1::uuid[]) FOR UPDATE',[fixtures.slice(0,21).map(f=>f.game)]);
  await recover();
  for(let i=0;i<21;i++)assert.equal(Number((await state(ids[i])).revision),Number(playerLockRevisions[i].revision));
  assert.equal(Number((await state(ids[21])).revision),Number(playerLockRevisions[21].revision)+1);
  await locker.query('ROLLBACK');
  await c.query('UPDATE private.battle31_matches SET paused_at=0 WHERE dealer_game_id=ANY($1::uuid[])',[ids]);
  await c.query('UPDATE private.battle31_matches SET paused_at=NULL WHERE dealer_game_id=ANY($1::uuid[])',[smallIds]);
  // Stale session identity and pause must exclude work before mutation.
  await c.query('UPDATE public.games SET current_game_uuid=NULL WHERE id=$1',[small[0].game]);
  await c.query('UPDATE public.games SET is_paused=true WHERE id=$1',[small[1].game]);
  const pausedRevision=Number((await state(small[1].id)).revision);
  await recover();
  assert.equal(Number((await state(small[0].id)).revision),0);
  assert.equal(Number((await state(small[1].id)).revision),pausedRevision);
  await c.query('UPDATE public.games SET current_game_uuid=$2 WHERE id=$1',[small[0].game,small[0].id]);
  await c.query('UPDATE public.games SET is_paused=false WHERE id=$1',[small[1].game]);
  await c.query('UPDATE private.battle31_matches SET paused_at=0 WHERE dealer_game_id=ANY($1::uuid[])',[ids]);
  const target=small[0];
  await c.query('UPDATE private.battle31_matches SET paused_at=NULL WHERE dealer_game_id=$1',[target.id]);
  await Promise.all([recover(c),recover(other)]);
  assert.equal(Number((await state(target.id)).revision),1,'competing workers commit one transition');
  // Canonically settle all 42; then prove bounded terminal recovery and replay.
  await c.query('UPDATE private.battle31_matches SET paused_at=NULL WHERE dealer_game_id=ANY($1::uuid[])',[ids]);
  for(const f of fixtures){const m=await state(f.id);await c.query("SELECT private.battle31_commit($1,$2,$3,$4,'resign',NULL)",[f.id,randomUUID(),m.revision,m.state.players[0].id]);}
  await c.query("UPDATE private.battle31_matches SET state=jsonb_set(state,'{terminal,deadline}','1') WHERE dealer_game_id=ANY($1::uuid[])",[ids]);
  await c.query("UPDATE private.battle31_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=ANY($1::uuid[])",[ids.slice(0,21)]);
  await locker.query('BEGIN');
  await locker.query('SELECT id FROM public.games WHERE id=ANY($1::uuid[]) FOR UPDATE',[fixtures.slice(0,21).map(f=>f.game)]);
  await recover();
  assert.equal((await c.query('SELECT count(*)::int n FROM private.battle31_matches WHERE dealer_game_id=ANY($1::uuid[]) AND finished',[ids])).rows[0].n,20);
  await recover();
  assert.equal((await c.query('SELECT count(*)::int n FROM private.battle31_matches WHERE dealer_game_id=ANY($1::uuid[]) AND finished',[ids])).rows[0].n,21);
  await locker.query('ROLLBACK');
  await locker.query('BEGIN');
  await locker.query('SELECT id FROM public.players WHERE game_id=ANY($1::uuid[]) FOR UPDATE',[fixtures.slice(0,20).map(f=>f.game)]);
  await recover();
  assert.equal((await c.query('SELECT count(*)::int n FROM private.battle31_matches WHERE dealer_game_id=ANY($1::uuid[]) AND finished',[ids])).rows[0].n,22,'terminal player locks cannot starve the healthy tail');
  await locker.query('ROLLBACK');await recover();await recover();
  assert.equal((await c.query('SELECT count(*)::int n FROM private.battle31_matches WHERE dealer_game_id=ANY($1::uuid[]) AND finished',[ids])).rows[0].n,42);
  assert.equal((await c.query('SELECT count(*)::int n FROM public.game_results WHERE dealer_game_id=ANY($1::uuid[])',[ids])).rows[0].n,42);
  assert.equal((await c.query('SELECT sum(chips)::int n FROM public.players WHERE game_id=ANY($1::uuid[])',[fixtures.map(f=>f.game)])).rows[0].n,8400);
  results.push({real,fixtures:42,lockedFront:21,gameplayBatch:20,terminalBatch:20,roundGameMatchPlayerLocksSkipped:true,playerLockedFront:21,terminalPlayerLockedFront:20,otherGameRecovery:true,staleIdentityAndPause:true,competingWorkers:true,canonicalResults:42,chipTotal:8400,firstBatchMs:elapsed});
 }
 const evidence={at:new Date().toISOString(),database,recoverySHA256:createHash('sha256').update(readFileSync('supabase/battle31/recovery.sql')).digest('hex'),statementTimeoutMs:1500,results};
 writeFileSync('dev/battle31/evidence/recovery-contention.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
}finally{await locker.query('ROLLBACK').catch(()=>{});await Promise.all([c.end(),locker.end(),other.end()]);}
