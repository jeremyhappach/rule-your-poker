// Local-only rollback reproduction of first-placement Ready inactivity.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync as write} from 'node:fs';
import {connect,context} from './human-ready-local.mjs';
const c=await connect(context().database),evidence=[];
const q=async(s,a=[])=>(await c.query(s,a)).rows[0];
const actor=async u=>c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[u,JSON.stringify({sub:u,role:'authenticated'})]);
try {
 await c.query('BEGIN');
 await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
 for(const [real,bot] of [[false,true],[false,false],[true,false]]) {
  const users=[uuid(),uuid()],players=[uuid(),uuid()],g=uuid();
  for(const u of users){await c.query('insert into auth.users(id) values($1)',[u]);await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[u,'Secondary '+u]);}
  await c.query("insert into public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) values($1,$2,'game_selection',$3,2,clock_timestamp()+interval '10 minutes',0,false,false)",[g,users[0],real]);
  for(let i=0;i<2;i++)await c.query("insert into public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting,auto_ante) values($1,$2,$3,$4,100,$5,'active',false,false,true)",[players[i],g,users[i],2-i,bot&&i===1]);
  await actor(users[0]);
  const deadline=(await q('select config_deadline::text d from public.games where id=$1',[g])).d;
  const d=(await q("select public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":7}',$3) v",[g,players[0],deadline])).v.dealer_game.id;
  if(bot)await c.query('select public.advance_ante_phase($1,$2)',[g,d]);
  else{await actor(users[1]);await c.query("select public.submit_ante_decision($1,$2,$3,'ante_up')",[g,d,players[1]]);}
  await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 where dealer_game_id=$1",[d]);
  let m=await q('select * from private.eleven_up_matches where dealer_game_id=$1',[d]);
  for(let step=0;step<10&&(m.state.players[m.state.turnIndex].isBot||m.state.phase!=='ready');step++) {
   const phase=m.state.phase,action=phase==='ready'?'pass':phase==='playing'?'take_score':'tick';
   const at=phase==='ready'?m.state.deadline-1:phase==='playing'?m.state.startedAt+1:m.state.deadline;
   await c.query('update private.eleven_up_matches set state=private.eleven_up_reduce(state,$2,null,$3),revision=revision+1 where dealer_game_id=$1',[d,action,at]);
   m=await q('select * from private.eleven_up_matches where dealer_game_id=$1',[d]);
  }
  const p=m.state.players[m.state.turnIndex].id,u=users[players.indexOf(p)];assert(!m.state.players[m.state.turnIndex].isBot);
  assert.equal(m.state.stage,1);assert.equal(m.state.phase,'ready');assert.equal(m.state.groups,0);
  await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[d,Date.now()-100]);
  await c.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");await c.query('select private.eleven_up_recover()');
  m=await q('select * from private.eleven_up_matches where dealer_game_id=$1',[d]);
  const paused=(await q('select is_paused from public.games where id=$1',[g])).is_paused;
  assert.equal(paused,real||bot);assert.equal(m.state.phase,real||bot?'ready':'playing');
  const flags=await q('select auto_fold,sit_out_next_hand from public.players where id=$1',[p]);
  assert.equal(flags.auto_fold,!real);assert.equal(flags.sit_out_next_hand,!real);
  await actor(u);const before=m.state;
  const snap=(await q('select public.eleven_up_snapshot($1) v',[d])).v;
  assert.equal(snap.players.find(x=>x.id===p).autoplay,!real);
  await c.query('select public.eleven_up_reclaim($1,$2)',[d,m.revision]);
  m=await q('select * from private.eleven_up_matches where dealer_game_id=$1',[d]);
  assert.deepEqual(m.state,before);assert.equal((await q('select is_paused from public.games where id=$1',[g])).is_paused,paused);
  assert.equal((await q('select auto_fold or sit_out_next_hand v from public.players where id=$1',[p])).v,false);
  evidence.push({real,opponent:bot?'bot':'human',phaseAfterTimeout:m.state.phase,paused,autoplayAfterTimeout:flags.auto_fold,reclaimClearsFlagsWithoutResume:true});
 }
 await c.query('ROLLBACK');write('qualification.local/eleven-up-timeout/secondary-ready-repro.json',JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await c.query('ROLLBACK');await c.end();}
