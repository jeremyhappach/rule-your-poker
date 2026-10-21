import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {connect,context} from './bots-database.mjs';
const {database}=context(),c=await connect(database),evidence=[];
const proof=JSON.parse(read('qualification.local/eleven-up-bots/proof.json','utf8'));
assert.equal(proof.database,database);assert(proof.evidence.some(x=>x.name.startsWith('All candidate changes')));
const candidate=['bots','bot-recovery'].map(n=>read(`supabase/eleven-up/${n}.sql`,'utf8')).join('\n');
const q=async(sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 await c.query('begin');await c.query(candidate);await c.query('update private.eleven_up_release set enabled=true,admission_enabled=true');await c.query('commit');
 for(const real of [false,true]){
  const g=uuid(),users=[uuid(),uuid()],players=[uuid(),uuid()],deadline=new Date(Date.now()+600000).toISOString();
  await c.query('begin');
  await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
  for(const u of users){await c.query('insert into auth.users(id) values($1)',[u]);await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[u,'11 bot race '+u]);}
  await c.query("insert into public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) values($1,'game_selection',$2,2,$3,0,false,false)",[g,real,deadline]);
  for(let i=0;i<2;i++)await c.query('insert into public.players(id,game_id,user_id,position,chips,is_bot) values($1,$2,$3,$4,100,$5)',[players[i],g,users[i],2-i,i===1&&!real]);
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[users[0]]);
  const offer=await q("select public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":7}',$3) v",[g,players[0],deadline]),d=offer.dealer_game.id;
  if(real){await c.query("select set_config('request.jwt.claim.sub',$1,true)",[users[1]]);await c.query("select public.submit_ante_decision($1,$2,$3,'ante_up')",[g,d,players[1]]);}
  await c.query('select public.advance_ante_phase($1,$2)',[g,d]);
  await c.query("update private.eleven_up_matches set state=state||jsonb_build_object('phase','ready','deadline',$2::bigint) where dealer_game_id=$1",[d,Date.now()+30000]);await c.query('commit');
  await c.query('select pg_sleep(.8)');const rev=await q('select revision v from private.eleven_up_matches where dealer_game_id=$1',[d]);
  const clients=await Promise.all([connect(database),connect(database)]);
  try{
   // Independent connections contend at the same due move; SKIP LOCKED and revision
   // identity allow one reducer transition, even when the second scan was stale.
   if(!real){await Promise.all(clients.map(x=>x.query('select private.eleven_up_recover()')));
   assert.equal(BigInt(await q('select revision v from private.eleven_up_matches where dealer_game_id=$1',[d])),BigInt(rev)+1n);}
   await c.query("update private.eleven_up_matches set state=state||jsonb_build_object('phase','complete','turnIndex',2,'scores',$2::jsonb) where dealer_game_id=$1",[d,{[players[0]]:0,[players[1]]:100}]);
   await Promise.all(clients.map(x=>x.query('select private.eleven_up_settle($1)',[d])));
   await c.query('select private.eleven_up_settle($1)',[d]);
   const balances=(await c.query('select id,chips from public.players where game_id=$1 order by position desc',[g])).rows;assert.deepEqual(balances.map(x=>x.chips),[93,107]);
   assert.equal(await q('select count(*)::int v from public.game_results where dealer_game_id=$1',[d]),1);
   assert.equal(await q('select count(*)::int v from public.gameplay_transfer_batches where dealer_game_id=$1',[d]),1);
   assert.equal(await q('select count(*)::int v from public.session_player_snapshots where dealer_game_id=$1',[d]),2);
   assert.equal(await q('select count(*)::int v from private.multiplayer_score_results where dealer_game_id=$1',[d]),0);
   evidence.push({real,game:g,dealer:d,balances,concurrentBotMove:real?'not admitted in real money':'one',settlements:1});
  }finally{await Promise.all(clients.map(x=>x.end()));}
  if(!real){
   await c.query('begin');await c.query('delete from public.games where id=$1',[g]);await c.query('delete from public.profiles where id=any($1::uuid[])',[users]);await c.query('delete from auth.users where id=any($1::uuid[])',[users]);await c.query('commit');
   assert.equal(await q('select count(*)::int v from public.games where id=$1',[g]),0);
  }
 }
 write('qualification.local/eleven-up-bots/race.json',JSON.stringify({database,evidence,cleanup:'Fake-money fixture removed; synthetic real-money fixture retained only in dedicated local DB because canonical history retention forbids deletion.'},null,2));console.log('PASS',JSON.stringify(evidence));
}catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{await c.end();}
