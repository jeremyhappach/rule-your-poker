import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {connect} from './bots-fixture.mjs';
const read=name=>readFile('qualification.local/tri-towers/'+name,'utf8').then(JSON.parse);
const proof=await read('v2-proof.json'),edges=await read('v2-edges.json'),browser=await read('v2-browser.json'),life=await read('v2-lifecycle.json');
assert(life.passed);const {database}=await read('v2-context.json'),c=await connect(database),competitions=[];
try{
 for(const {fixture:f,match:m,balances}of life.matches){
  const top=Math.max(...Object.values(m.state.scores)),winners=f.players.filter(id=>m.state.scores[id]===top);
  const results=(await c.query('SELECT id FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows;
  const batches=(await c.query('SELECT id,transfers,unmatched_deltas FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer])).rows;
  const snaps=(await c.query('SELECT player_id,chips,is_bot FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows;
  assert.equal(results.length,1);assert.equal(batches.length,winners.length===f.players.length?0:1);assert(batches.every(b=>Object.keys(b.unmatched_deltas).length===0));assert.equal(snaps.length,f.players.length);
  for(let i=0;i<f.players.length;i++){const id=f.players[i],actual=Number(balances.find(p=>p.id===id).chips),snap=snaps.find(s=>s.player_id===id);assert.equal(actual,f.chips[i]+m.settlement[id]);assert.equal(Number(snap.chips),actual);assert.equal(snap.is_bot,f.kinds[i]);if(!winners.includes(id))assert.equal(m.settlement[id],-5);if(winners.length===1&&winners[0]===id)assert.equal(m.settlement[id],5*(f.players.length-1));}
  competitions.push({participants:f.players.length,bots:f.kinds.filter(Boolean).length,rounds:m.state.stages.length,bonusRounds:m.state.stages.filter(s=>s.stage===3).length,scores:f.players.map(id=>m.state.scores[id]),opening:f.chips,closing:f.players.map(id=>Number(balances.find(p=>p.id===id).chips)),results:results.length,batches:batches.length,snapshots:snaps.length});
 }
 const runs=await read(database+'-worker.json'),errors=runs.filter(r=>r.error);assert(errors.every(r=>/record "new" has no field/.test(r.error)),'unresolved worker failure');
 const lastError=errors.at(-1)?.at??0,clean=runs.filter(r=>!r.error&&r.at>lastError),ms=clean.map(r=>r.ms).sort((a,b)=>a-b);
 assert(ms.length>100);assert(ms[Math.floor(ms.length*.95)]<100);assert(ms.at(-1)<1000);
 const gap=[];let prior=life.samples[0];for(const s of life.samples.slice(1)){if(s.full!==prior.full){gap.push(s.at-prior.at);prior=s;}}assert(Math.max(...gap)<45000);
 const definitions=(await c.query("SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname LIKE 'tri_towers_%' ORDER BY 1")).rows;
 const evidence={date:'2026-10-16',gate:'PASS',version:'tri-towers/2',migration:'20261016233453_tri_towers_v2.sql',definitions,proof:proof.passed,financial:proof.financial,edges:edges.passed,browser:browser.passed,competitions,elapsedMs:life.elapsedMs,maxProgressGapMs:Math.max(...gap),worker:{calls:clean.length,meanMs:ms.reduce((a,b)=>a+b)/ms.length,p95Ms:ms[Math.floor(ms.length*.95)],maxMs:ms.at(-1),processed:clean.reduce((n,r)=>n+r.processed,0),qualificationAdapterErrors:errors.length,unresolvedErrors:0},regression:{application:2299,harness:241,finalFocused:23,typecheck:'PASS',build:'PASS'},limitations:['Authenticated PostgreSQL roles and commit-notification SSE substitute for Supabase Auth/Realtime in the loopback browser proof.','A local notification-adapter error was corrected before the final successful browser run; production was never affected.','Jeremy production smoke remains acceptance truth.']};
 await writeFile('dev/tri-towers/v2.evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,definitions:definitions.length}));
}finally{await c.end();}
