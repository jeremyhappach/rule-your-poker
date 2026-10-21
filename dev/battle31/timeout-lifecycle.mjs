import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {connect,localContext} from './database.mjs';
import {fixture,rpc} from './fixture.mjs';
const c=await connect(localContext().database),q=async(s,a=[])=>(await c.query(s,a)).rows;
const state=async f=>(await q('SELECT * FROM private.battle31_matches WHERE dealer_game_id=$1',[f.id]))[0];
const player=async id=>(await q('SELECT * FROM public.players WHERE id=$1',[id]))[0];
const game=async f=>(await q('SELECT * FROM public.games WHERE id=$1',[f.game]))[0];
const snap=(f,i=0)=>rpc(f.users[i],'SELECT public.battle31_snapshot($1) v',[f.id]);
async function action(f,i,type,revision,request=uuid()){return rpc(f.users[i],'SELECT public.battle31_action($1,$2,$3,$4) v',[f.id,request,revision??(await state(f)).revision,type]);}
async function prepare(real){const f=await fixture(real);await q('UPDATE public.games SET current_host=$2 WHERE id=$1',[f.game,f.users[0]]);const roster=(await state(f)).state.players.sort((a,b)=>f.players.indexOf(a.id)-f.players.indexOf(b.id));await q("UPDATE private.battle31_matches SET state=jsonb_set(state,'{players}',$2) WHERE dealer_game_id=$1",[f.id,JSON.stringify(roster)]);await q("UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','playing','turn',1,'turnIndex',0,'closing',false,'hands','[[0,1,10],[16,17,26]]'::jsonb,'center','[2,11,20]'::jsonb,'deadline',0) WHERE dealer_game_id=$1",[f.id]);return f;}
async function recover(f){await q('SELECT private.battle31_commit($1,$2,$3,$4,$5)',[f.id,uuid(),(await state(f)).revision,(await state(f)).state.players[(await state(f)).state.turnIndex].id,'tick']);}
async function pause(f,value,user=0){return rpc(f.users[user],'SELECT public.set_game_paused($1,$2,$3,$4) v',[f.game,value,f.id,(await game(f)).pause_version]);}
async function bot(f,revision){const m=await state(f);return q("SELECT private.battle31_commit($1,$2,$3,$4,'bot')",[f.id,uuid(),revision??m.revision,m.state.players[m.state.turnIndex].id]);}
const checks=[];
try {
 const real=await prepare(true),before=await state(real);
 await recover(real);const paused=await state(real),g=await game(real),p=await player(real.players[0]);
 assert(g.is_paused&&g.timer_paused_at&&paused.paused_at);assert(!p.auto_fold&&!p.sit_out_next_hand);
 for(const key of ['hands','center','turn','turnIndex','losses','stage'])assert.deepEqual(paused.state[key],before.state[key]);
 assert.equal(p.chips,100);assert.equal(paused.settlement,null);assert.equal((await snap(real)).paused,true);
 await q('SELECT private.battle31_recover()');assert.equal((await state(real)).revision,paused.revision);
 assert.equal((await pause(real,false,1)).outcome,'not_authorized');assert.equal((await pause(real,false)).outcome,'resumed');
 assert((await state(real)).state.deadline>Date.now()+14000);checks.push('real timeout pauses without action, flags, losses or chips; reconnect, repeated worker and authorized full-clock resume');

 const fake=await prepare(false);await recover(fake);let m=await state(fake),v=await snap(fake);
 assert(!(await game(fake)).is_paused);assert(v.players[0].autoPlay&&v.players[0].sitOutNextHand&&!v.canAct);
 assert.deepEqual(v.hands[1],[null,null,null]);assert.equal(v.values[1],null);
 const expected=(await q('SELECT private.battle31_bot_choice(private.battle31_visible(state,$2)) v FROM private.battle31_matches WHERE dealer_game_id=$1',[fake.id,fake.players[0]]))[0].v;
 await assert.rejects(action(fake,0,'pass'),/not_controller/);
 await assert.rejects(action(fake,0,'bot'),/forbidden/);
 await q("UPDATE private.battle31_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[fake.id]);
 await bot(fake);const moved=await state(fake);assert(moved.state.turn>m.state.turn||moved.state.phase!=='playing');
 const recorded=(await q("SELECT * FROM private.battle31_requests WHERE dealer_game_id=$1 AND command->>'action'='bot'",[fake.id]))[0],receipt=recorded.command;assert.equal(receipt.resolvedAction,expected.action);assert.deepEqual(receipt.resolvedItems,expected.items);
 await q("SELECT private.battle31_commit($1,$2,$3,$4,'bot')",[fake.id,recorded.request_id,receipt.revision,recorded.actor]);assert.equal((await state(fake)).revision,moved.revision);
 assert.equal(moved.state.event.label,expected.action==='pass'?'Opponent’s last turn':expected.action==='swap'?'Card exchanged':'All three exchanged');
 assert((await player(fake.players[0])).sit_out_next_hand);assert(!(await player(fake.players[0])).sitting_out);
 checks.push('fake timeout enables canonical autoplay/deferred sit-out; private projection remains masked; strategic bot advances');

 // Reclaim a current controlled turn; queued service commands must lose authority.
 await q("UPDATE private.battle31_matches SET state=jsonb_set(state,'{turnIndex}','0') WHERE dealer_game_id=$1",[fake.id]);
 m=await state(fake);const request=uuid();await action(fake,0,'autoplay_off',m.revision,request);
 let reclaimed=await state(fake);v=await snap(fake);let live=await player(fake.players[0]);
 assert(!live.auto_fold&&!live.sit_out_next_hand&&!live.auto_play_stop_round_id);assert(v.canAct&&!v.players[0].autoPlay);
 assert(reclaimed.state.deadline>Date.now()+14000);
 await assert.rejects(bot(fake,m.revision),/stale_revision/);await assert.rejects(bot(fake,reclaimed.revision),/not_controller/);
 await action(fake,0,'autoplay_off',m.revision,request);assert.equal((await state(fake)).revision,reclaimed.revision);
 const onRequest=uuid(),onRevision=(await state(fake)).revision;await action(fake,0,'autoplay_on',onRevision,onRequest);assert((await snap(fake)).players[0].autoPlay);
 await action(fake,0,'autoplay_off');await action(fake,0,'autoplay_on',onRevision,onRequest);assert(!(await player(fake.players[0])).auto_fold);await action(fake,0,'pass');checks.push('current-turn reclaim clears both flags, resets human deadline, rejects stale/fresh unauthorized bot commands, and replay is idempotent');

 // Canonical RPC outside the Battle adapter must also invalidate queued work.
 await action(fake,0,'autoplay_on');m=await state(fake);live=await player(fake.players[0]);
 await rpc(fake.users[0],'SELECT public.set_automatic_play($1,$2,$3,$4,$5,false) v',[fake.game,m.round_id,fake.id,live.id,live.intent_version]);
 await assert.rejects(bot(fake,m.revision),/stale_revision/);assert(!(await snap(fake)).players[0].autoPlay);
 checks.push('shared canonical control changes advance the Battle revision');

 // Unchecking while the opponent owns the turn preserves that opponent clock.
 await action(fake,0,'autoplay_on');await q("UPDATE private.battle31_matches SET state=jsonb_set(state,'{turnIndex}','1') WHERE dealer_game_id=$1",[fake.id]);
 const deadline=(await state(fake)).state.deadline;await action(fake,0,'autoplay_off');assert.equal((await state(fake)).state.deadline,deadline);
 await action(real,0,'autoplay_on');assert.equal((await pause(real,true)).outcome,'paused');await action(real,0,'autoplay_off');assert((await game(real)).is_paused);await pause(real,false);
 checks.push('off-turn reclaim preserves opponent deadline; paused reclaim does not resume the game');

 // A service decision racing reclaim may win first, but cannot act after reclaim.
 const race=await prepare(false);await recover(race);m=await state(race);
 const raced=await Promise.allSettled([bot(race,m.revision),action(race,0,'autoplay_off',m.revision)]);
 assert(raced.some(x=>x.status==='fulfilled'));if((await player(race.players[0])).auto_fold)await action(race,0,'autoplay_off');
 assert(!(await player(race.players[0])).auto_fold);await assert.rejects(bot(race,m.revision),/stale_revision|wrong_turn/);
 checks.push('independent-connection reclaim/bot race serializes; reclaimed control persists');

 for(const reclaim of [false,true]){
  const f=await prepare(false);await recover(f);
  // Internal life-round rollover must retain the same two seats and deferred flag.
  await q("UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','round_result','deadline',0) WHERE dealer_game_id=$1",[f.id]);
  await recover(f);assert.equal((await state(f)).state.players.length,2);assert(!(await player(f.players[0])).sitting_out);
  if(reclaim)await action(f,0,'autoplay_off');
  await action(f,1,'resign');await q("UPDATE private.battle31_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1",[f.id]);
  await q('SELECT private.battle31_finish_postgame($1)',[f.id]);live=await player(f.players[0]);
  assert.equal(live.sitting_out,!reclaim);assert(!live.auto_fold&&!live.sit_out_next_hand);assert((await state(f)).finished);
 }
 checks.push('deferred sit-out waits for match boundary; unreclaimed player sits out, reclaimed player stays eligible; flags clear exactly once');
 writeFileSync('dev/battle31/evidence/timeout-lifecycle.json',JSON.stringify({at:new Date().toISOString(),database:localContext().database,passed:true,checks},null,2)+'\n');
 console.log(JSON.stringify(checks));
} finally {await c.end();}
