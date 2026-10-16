import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';
import {connect,context,fixture,state,balances,actor,action} from './bots-fixture.mjs';
const base=await context(),database=`tri_bots_lifecycle_${Date.now()}`,root=await connect('postgres');await root.query(`CREATE DATABASE ${database} TEMPLATE ${base.database}`);await root.end();
const c=await connect(database),passed=[],evidence={database};const pass=s=>{passed.push(s);console.log('PASS',s);};
const full=await fixture(c,database,[false,true,true,true,true,true,true]);
const mixed=await fixture(c,database,[false,false,true,false,true]);
const worker=fork('dev/tri-towers/bots.worker.mjs',[database],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});await new Promise(r=>worker.once('message',r));
const started=Date.now(),samples=[];
try{
 while(Date.now()-started<1050000){
  const a=await state(c,full),b=await state(c,mixed);samples.push({at:Date.now(),full:a.revision,mixed:b.revision});
  if(a.settlement&&b.settlement){evidence.matches=[{fixture:full,match:a,balances:await balances(c,full)},{fixture:mixed,match:b,balances:await balances(c,mixed)}];break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(evidence.matches,'Full autonomous competitions exceeded normal-speed budget');
 for(const r of evidence.matches){const f=r.fixture,m=r.match;assert.equal(Object.keys(m.state.scores).length,f.players.length);for(const id of f.players.filter((_,i)=>f.kinds[i])){const stages=m.state.stages.filter(s=>s.playerId===id);assert(stages.length>=2);assert(stages.every(s=>s.reason!=='timeout'&&s.reason!=='give_up'));}
  assert.equal(r.balances.reduce((sum,p)=>sum+Number(p.chips),0),f.chips.reduce((a,b)=>a+b));assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
 }
 pass('One human + six bots and mixed human/bot positions finish complete competitions with zero browsers at one-second cadence');
 const before=await balances(c,full),done=await state(c,full);for(let i=0;i<3;i++)await c.query('SELECT private.tri_towers_recover()');assert.deepEqual(await balances(c,full),before);assert.equal((await state(c,full)).revision,done.revision);
 await assert.rejects(action(database,full,full.users[0],0,'draw'),/inactive|stale_revision/);
 pass('Duplicate post-settlement recovery and stale requests cannot change canonical balances or revisions');
 const durations=(await c.query("SELECT dealer_game_id,revision,frame->>'phase' phase,frame->'stages'->-1 result FROM private.tri_towers_history WHERE dealer_game_id=ANY($1::uuid[]) ORDER BY dealer_game_id,revision",[[full.dealer,mixed.dealer]])).rows;
 evidence.historyRows=durations.length;evidence.elapsedMs=Date.now()-started;evidence.samples=samples;evidence.passed=passed;evidence.productionWrites=0;
 await writeFile('qualification.local/tri-towers/bots-lifecycle.json',JSON.stringify(evidence,null,2));
}finally{worker.send('stop');await new Promise(r=>worker.once('exit',r));await c.end();}
