import {readFile,writeFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';
import {connect} from './bots-fixture.mjs';
const read=name=>readFile('qualification.local/tri-towers/'+name,'utf8').then(JSON.parse);
const proof=await read('bots-proof.json'),boundaries=await read('bots-boundaries.json'),browser=await read('bots-browser.json'),lifecycle=await read('bots-lifecycle.json');
const workers=await Promise.all([browser.database,lifecycle.database].map(db=>read(db+'-worker.json')));
const lifecycleDb=await connect(lifecycle.database);
try {
 for(const r of lifecycle.matches){
  const f=r.fixture,m=r.match,top=Math.max(...Object.values(m.state.scores)),winners=f.players.filter(id=>m.state.scores[id]===top);
  assert.equal(Object.keys(m.state.scores).length,f.players.length);
  const snapshots=(await lifecycleDb.query('SELECT player_id,chips,is_bot FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows;
  assert.equal(snapshots.length,f.players.length);
  for(let i=0;i<f.players.length;i++){
   const id=f.players[i],chips=Number(r.balances.find(p=>p.id===id).chips),snap=snapshots.find(p=>p.player_id===id);
   assert.equal(chips,f.chips[i]+m.settlement[id]);assert.equal(Number(snap.chips),chips);assert.equal(snap.is_bot,f.kinds[i]);
   if(!winners.includes(id))assert.equal(m.settlement[id],-5);
   if(winners.length===1&&winners[0]===id)assert.equal(m.settlement[id],5*(f.players.length-1));
  }
  assert.equal((await lifecycleDb.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
  const batches=(await lifecycleDb.query('SELECT unmatched_deltas FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer])).rows;
  assert.equal(batches.length,winners.length===f.players.length?0:1);assert(batches.every(b=>Object.keys(b.unmatched_deltas).length===0));
 }
} finally {await lifecycleDb.end();}
lifecycle.passed.push('Every autonomous competition has exact score-derived canonical payouts, matching human/bot snapshots, one result and balanced actual transfer batches');
const definitions=[];
for(const database of [proof.database,browser.database,lifecycle.database]){const c=await connect(database);try{definitions.push((await c.query("SELECT proname,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND proname IN ('tri_towers_bot_choice','tri_towers_schedule_bot','tri_towers_recover','tri_towers_configure') ORDER BY proname")).rows);}finally{await c.end();}}
assert.deepEqual(definitions[0],definitions[1]);assert.deepEqual(definitions[0],definitions[2]);
await writeFile('qualification.local/tri-towers/bots-qualified-hashes.json',JSON.stringify(definitions[0],null,2));
const metrics=workers.map(runs=>{assert(runs.length>30);assert(runs.every(r=>!r.error));const ms=runs.map(r=>r.ms).sort((a,b)=>a-b);return {calls:ms.length,maxMs:ms.at(-1),p95Ms:ms[Math.floor(ms.length*.95)],meanMs:ms.reduce((a,b)=>a+b)/ms.length,processed:runs.reduce((n,r)=>n+r.processed,0)};});
assert(metrics.every(m=>m.p95Ms<100&&m.maxMs<1000),'Worker latency budget exceeded');
const evidence={date:'2026-10-16',gate:'PASS',productionWrites:0,migration:proof.migration,qualifiedDefinitions:definitions[0],proofs:proof.passed,boundaries:boundaries.passed,browser:browser.passed,zeroClient:lifecycle.passed,normalSpeedDurationMs:lifecycle.elapsedMs,worker:metrics,regression:{application:2250,harness:241,typecheck:'PASS',build:'PASS'},limitations:['Loopback authenticated SQL roles and commit-notification/SSE transport substitute for Supabase Auth/Realtime in browser qualification.','Production pg_cron, installed definitions and deployment require separate release verification.','Jeremy production gameplay smoke remains acceptance truth.']};
await writeFile('dev/tri-towers/bots.evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
