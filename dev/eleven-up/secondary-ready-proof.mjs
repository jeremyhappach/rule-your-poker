import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,context,body} from './human-ready-local.mjs';
const c=await connect(context().database),evidence=[];
const q=async(s,a=[])=>(await c.query(s,a)).rows[0];
const actor=async u=>c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[u,JSON.stringify({sub:u,role:'authenticated'})]);
const service=async()=>c.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
const match=async f=>q('select * from private.eleven_up_matches where dealer_game_id=$1',[f.id]);
async function fixture(real=false,bots=0){
 const n=bots?bots+1:2,f={game:uuid(),users:Array.from({length:n},uuid),players:Array.from({length:n},uuid)};
 await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
 for(const u of f.users){await c.query('insert into auth.users(id) values($1)',[u]);await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[u,'Secondary '+u]);}
 await c.query("insert into public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) values($1,$2,'game_selection',$3,$4,clock_timestamp()+interval '10 minutes',0,false,false)",[f.game,f.users[0],real,n]);
 for(let i=0;i<n;i++)await c.query("insert into public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting,auto_ante) values($1,$2,$3,$4,100,$5,'active',false,false,true)",[f.players[i],f.game,f.users[i],n-i,bots>0&&i>0]);
 await actor(f.users[0]);const deadline=(await q('select config_deadline::text d from public.games where id=$1',[f.game])).d;
 f.id=(await q("select public.eleven_up_configure($1,$2,$3,'eleven-up','{\"ante_amount\":7}',$4) v",[f.game,f.players[0],n,deadline])).v.dealer_game.id;
 if(bots)await c.query('select public.advance_ante_phase($1,$2)',[f.game,f.id]);
 else{await actor(f.users[1]);await c.query("select public.submit_ante_decision($1,$2,$3,'ante_up')",[f.game,f.id,f.players[1]]);}
 // Legally finish any earlier bot turns to reach this human's FIRST placement.
 for(let i=0;i<20;i++){
  const m=await match(f);if(m.state.phase==='ready'&&!m.state.players[m.state.turnIndex].isBot)break;
  const phase=m.state.phase,action=phase==='ready'?'pass':phase==='playing'?'take_score':'tick';
  const at=phase==='ready'?m.state.deadline-1:phase==='playing'?m.state.startedAt+1:m.state.deadline;
  await c.query('update private.eleven_up_matches set state=private.eleven_up_reduce(state,$2,null,$3),revision=revision+1 where dealer_game_id=$1',[f.id,action,at]);
 }
 const m=await match(f);assert.equal(m.state.stage,1);assert.equal(m.state.phase,'ready');
 f.active=m.state.players[m.state.turnIndex].id;f.user=f.users[f.players.indexOf(f.active)];
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[f.id,Date.now()-1]);return f;
}
async function complete(f){
 await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where game_id=$1 and not is_bot',[f.game]);
 await service();let moves=0;
 for(;moves<1500;moves++){
  const m=await match(f);if(m.settlement)break;
  let expected=null;
  if(m.state.phase==='playing'){
   // Bounded proof clock: each Ready still makes a real strategic bot move.
   // Expire the subsequent scoring clock and verify its exact existing result.
   const expired=Date.now()-1;
   expected=(await q("select private.eleven_up_reduce(jsonb_set($1::jsonb,'{deadline}',to_jsonb($2::bigint)),'tick',null,$2) v",[m.state,expired])).v;
   await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[f.id,expired]);
  }else if(['intro','stage_complete'].includes(m.state.phase))await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[f.id,Date.now()-1]);
  else await c.query('select pg_sleep(greatest(0,($1::bigint-extract(epoch from clock_timestamp())*1000)/1000)+0.01)',[Math.min(m.state.deadline,m.bot_due_at??m.state.deadline)]);
  await c.query('select private.eleven_up_recover()');
  if(expected)assert.deepEqual((await match(f)).state,expected,'scoring expiry preserves exact reducer result and time');
  assert.equal((await q('select is_paused from public.games where id=$1',[f.game])).is_paused,false);
  if(moves%25===0)console.log('Autoplay progress',{opponents:f.players.length-1,moves,phase:(await match(f)).state.phase});
 }
 const m=await match(f);assert(m.settlement,'autonomous match must settle');assert.equal(m.state.phase,'complete');
 assert.equal(Number((await q('select sum(chips) total from public.players where game_id=$1',[f.game])).total),f.players.length*100);
 assert.equal(Number((await q('select count(*) n from public.game_results where dealer_game_id=$1',[f.id])).n),1);
 assert.equal(Number((await q('select count(*) n from public.session_player_snapshots where dealer_game_id=$1',[f.id])).n),f.players.length);
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{terminal,deadline}','0') where dealer_game_id=$1",[f.id]);
 await c.query('select private.eleven_up_recover()');await c.query('select private.eleven_up_recover()');
 const g=await q('select status,current_game_uuid,config_deadline from public.games where id=$1',[f.game]);
 assert.equal(g.status,'waiting');assert.equal(g.current_game_uuid,null);assert.equal(g.config_deadline,null);
 assert.equal(Number((await q('select count(*) n from public.players where game_id=$1 and not is_bot and (not sitting_out or auto_fold or sit_out_next_hand)',[f.game])).n),0);
 assert.equal(Number((await q('select count(*) n from public.dealer_games where session_id=$1',[f.game])).n),1);
 evidence.push({opponents:f.players.length-1,moves,settledOnce:true,canonicalBalancesAndSnapshots:true,nextGameWaitsForHuman:true});
}
try{
 await c.query('BEGIN');
 const owners=(await c.query("select p.oid,pg_get_functiondef(p.oid) d,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname not in ('pause_all_humans_auto_fold','eleven_up_finish_postgame')")).rows;
 const beforeGuard=(await q("select pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure) d")).d;
 await c.query(body(read('supabase/eleven-up/secondary-ready.sql','utf8')));
 const afterGuard=(await q("select pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure) d")).d;
 const unpatch=s=>s.replace(/\n -- eleven_up_active_fake_completion_v1\n IF g.real_money IS FALSE THEN RETURN false; END IF;/g,'');
 assert.equal(unpatch(afterGuard),unpatch(beforeGuard),'other game gate/count/locks/pause unchanged');
 await c.query(body(read('supabase/eleven-up/secondary-ready.sql','utf8')));
 assert.equal((await q("select pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure) d")).d,afterGuard);
 for(const bots of [0,1,2]){
  const f=await fixture(false,bots);await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where game_id=$1 and id<>$2 and not is_bot',[f.game,f.active]);
  await service();await c.query('select private.eleven_up_recover()');let m=await match(f);
  assert.equal(m.state.phase,'playing');assert.equal((await q('select is_paused from public.games where id=$1',[f.game])).is_paused,false);
  assert(m.state.groups>0||m.state.cursor>23,'strategic legal first action');
  await actor(f.user);const snap=(await q('select public.eleven_up_snapshot($1) v',[f.id])).v;assert(snap.players.find(p=>p.id===f.active).autoplay);
  const rev=m.revision,saved=m.state;await c.query('select public.eleven_up_reclaim($1,$2)',[f.id,rev]);
  assert.deepEqual((await match(f)).state,saved);assert.equal((await match(f)).bot_due_at,null);
  assert.equal((await q('select auto_fold or sit_out_next_hand flags from public.players where id=$1',[f.active])).flags,false);
  await c.query('SAVEPOINT stale');await assert.rejects(()=>c.query("select public.eleven_up_action($1,$2,$3,'pass',null)",[f.id,uuid(),rev]),/stale_revision/);await c.query('ROLLBACK TO stale');
  evidence.push({bots,allHumansAway:true,readyTakeover:true,reload:true,reclaimWithoutClockReset:true,staleRejected:true});
  await complete(f);
 }
 const real=await fixture(true);await service();await c.query('select private.eleven_up_recover()');
 let m=await match(real);assert.equal(m.state.phase,'ready');assert(m.paused_at);assert.equal(m.bot_due_at,null);
 await actor(real.user);await c.query('select public.eleven_up_reclaim($1,$2)',[real.id,m.revision]);assert.equal((await q('select is_paused from public.games where id=$1',[real.game])).is_paused,true);
 evidence.push('real-money Ready still pauses; reclaim never implicitly resumes');
 await c.query(read('supabase/multiplayer-money/matrix.sql','utf8').replaceAll('__FAMILY__','eleven_up').replaceAll('__GAME__','eleven-up'));
 for(const f of owners){const now=await q('select pg_get_functiondef($1::oid) d,proacl from pg_proc where oid=$1',[f.oid]);assert.deepEqual(now,{d:f.d,proacl:f.proacl});}
 evidence.push('36 financial cases and every other function/ACL unchanged');
 await c.query('ROLLBACK');write('qualification.local/eleven-up-timeout/secondary-ready-proof.json',JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await c.query('ROLLBACK');await c.end();}
