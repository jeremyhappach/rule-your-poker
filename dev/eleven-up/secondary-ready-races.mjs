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
 // Independent connections exercise the real row locks and CAS, not mocks.
 await c.query('BEGIN');const race=await fixture(false);await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where game_id=$1 and id<>$2',[race.game,race.active]);await c.query('COMMIT');
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
 write('qualification.local/eleven-up-timeout/secondary-ready-races.json',JSON.stringify({database:context().database,evidence},null,2));console.log(evidence);
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
