import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';
import {connect,fixture,state,balances,action} from './bots-fixture.mjs';
const {database}=JSON.parse(await readFile('qualification.local/tri-towers/v2-context.json','utf8'));
const c=await connect(database),full=await fixture(c,database,[false,true,true,true,true,true,true]),mixed=await fixture(c,database,[false,false,true,false,true]);
const worker=fork('dev/tri-towers/bots.worker.mjs',[database],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});await new Promise(r=>worker.once('message',r));
const started=Date.now(),samples=[];let matches;
await writeFile('qualification.local/tri-towers/v2-lifecycle-context.json',JSON.stringify({database,full,mixed}));
console.log('Started normal-speed zero-browser competitions',database);
try{
 while(Date.now()-started<1200000){
  const a=await state(c,full),b=await state(c,mixed);
  samples.push({at:Date.now(),full:a.revision,mixed:b.revision,fullRound:a.state.stage,fullPlayer:a.state.turnIndex});
  if(samples.length%30===0)console.log('progress',samples.at(-1));
  if(a.settlement&&b.settlement){matches=[{fixture:full,match:a,balances:await balances(c,full)},{fixture:mixed,match:b,balances:await balances(c,mixed)}];break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(matches,'normal-speed completion timeout');
 for(const r of matches){
  const f=r.fixture,m=r.match,order=m.state.players.map(p=>p.id),expected=[...order.map(playerId=>({playerId,stage:1})),...order.map(playerId=>({playerId,stage:2})),...(m.state.qualified??[]).map(playerId=>({playerId,stage:3}))];
  assert.deepEqual(m.state.stages.map(({playerId,stage})=>({playerId,stage})),expected);
  assert.equal(Object.keys(m.state.scores).length,f.players.length);
  for(const id of f.players.filter((_,i)=>f.kinds[i]))assert(m.state.stages.filter(s=>s.playerId===id).every(s=>!['timeout','ready_timeout'].includes(s.reason)));
  assert.equal(r.balances.reduce((s,p)=>s+Number(p.chips),0),f.chips.reduce((a,b)=>a+b));
  for(let i=0;i<f.players.length;i++)assert.equal(Number(r.balances.find(p=>p.id===f.players[i]).chips),f.chips[i]+(m.settlement[f.players[i]]??0));
  assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
  const snapshots=(await c.query('SELECT player_id,chips FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows;
  for(const p of r.balances)assert.equal(Number(snapshots.find(s=>s.player_id===p.id).chips),Number(p.chips));
 }
 const before=await balances(c,full),done=await state(c,full);
 for(let i=0;i<3;i++)await c.query('SELECT private.tri_towers_recover()');
 assert.deepEqual(await balances(c,full),before);assert.equal((await state(c,full)).revision,done.revision);
 await assert.rejects(action(database,full,full.users[0],0,'draw'),/inactive|stale_revision/);
 await writeFile('qualification.local/tri-towers/v2-lifecycle.json',JSON.stringify({matches,elapsedMs:Date.now()-started,samples,passed:true,productionWrites:0},null,2));
 console.log('PASS full six-bot and mixed zero-browser competitions, exact order, canonical balances/snapshots and one settlement',Date.now()-started);
}finally{worker.send('stop');await new Promise(r=>worker.once('exit',r));await c.end();}
