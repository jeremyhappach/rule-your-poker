import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer as http} from 'node:http';
import {createServer as viteServer} from 'vite';
import {chromium} from '@playwright/test';
import {fixture,key,url,sql} from './local.mjs';
const f=await fixture();let runtime,browser,at=Date.now();
const vite=await viteServer({configFile:false,root:process.cwd(),server:{middlewareMode:true},appType:'custom',cacheDir:'qualification.local/vite-cache',
 resolve:{alias:{'@':path.resolve('src')}},optimizeDeps:{include:['react','react-dom','react-dom/client','@supabase/supabase-js']},
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(url),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-anon-key-initialized-before-serving')}});
// The fixture service key remains server-only; the browser gets the existing local anon key.
const {execFileSync}=await import('node:child_process');
const cli='C:/Users/jerem/AppData/Local/npm-cache/_npx/66b4952730d9cac8/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const status=JSON.parse(execFileSync(cli,['--workdir','C:/Users/jerem/Desktop/poker/run21-app-test-reconciled/qualification.local/local-stack','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
vite.config.define['import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY']=JSON.stringify(status.ANON_KEY);
const e=await vite.ssrLoadModule('/src/lib/run21/engine.ts'),{fixtureDeck}=await vite.ssrLoadModule('/src/lib/run21/fixtures.ts');
const {chooseAction}=await vite.ssrLoadModule('/src/lib/run21/bot.ts'),{DEFAULT_CONFIG}=await vite.ssrLoadModule('/src/lib/run21/model.ts');
const {standardDeck}=await vite.ssrLoadModule('/src/lib/run21/rules.ts');
const {createRun21Handler}=await vite.ssrLoadModule('/server/run21/handler.ts');
const human=f.row.participants.find(p=>p.kind==='human'),bot=f.row.participants.find(p=>p.kind==='bot');
let row=f.row,m=e.createMatch({sessionId:row.game_id,dealerGameId:row.dealer_game_id,handNumber:1},[human,bot].map(({id,seat,name,kind})=>({id,seat,name,kind})),row.stake,DEFAULT_CONFIG,at);
const command=(id,intent,time=at)=>{at=time;const r=m.rounds.at(-1);const out=e.applyCommand(m,{identity:m.identity,roundId:r.id,playerId:id,requestId:randomUUID(),revision:r.boards[id].revision,intent},{kind:'service'},at);assert.equal(out.status,'accepted');m=out.state;};
const commit=async()=>{const sequence=row.state?.eventSequence??0;const r=await f.admin.rpc('run21_server_commit',{p_dealer_game_id:row.dealer_game_id,p_expected_revision:row.revision,p_state:{...m,events:m.events.filter(e=>e.sequence>sequence)},p_bot_due_at:null});if(r.error)throw Error(r.error.message);assert.equal(r.data.outcome,'committed');row=r.data.record;m=row.state;};
fs.writeFileSync('qualification.local/latency-client.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import{useRun21Local}from'/src/hooks/useRun21Local';function App(){const a=useRun21Local('${row.game_id}','${row.dealer_game_id}');window.snapshot=a.snapshot;const v=a.snapshot?.view,b=v?.boards[v.viewerId];return <main><p data-current={b?.current?b.current.rank+' of '+b.current.suit:''}>{b?.current?.rank}</p>{Array.from({length:5},(_,column)=><button key={column} disabled={a.pending} onClick={()=>a.onIntent({type:'place',column})}>Column {column}</button>)}<button disabled={a.pending} onClick={()=>a.onIntent({type:'pass'})}>Pass</button><output>{a.error}</output></main>}createRoot(document.getElementById('root')).render(<App/>);`);
const server=http((req,res)=>{
 if(req.url.startsWith('/__run21/')){
  if(req.url.includes('/events')){void runtime.authority.read(row.game_id,f.user).then(snapshot=>{res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write('data: '+JSON.stringify(snapshot)+'\n\n');});return;}
  void runtime.handler(req,res);return;
 }
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/qualification.local/latency-client.tsx"></script>');return;}
 vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
});
const evidence={environment:'isolated local Supabase clone; real Auth, PostgreSQL, HTTP handler and unchanged React hook; initial SSE fixture only',samples:[]};
try{
 await new Promise(resolve=>server.listen(65432,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext();await context.addInitScript(session=>{
  if(location.origin==='null')return;localStorage.setItem('sb-127-auth-token',JSON.stringify(session));window.samples=[];let tap=0;
  document.addEventListener('pointerdown',()=>tap=performance.now(),true);const fetch0=window.fetch;
  window.fetch=async(input,options={})=>{const action=String(input).includes('/action');if(action)options.headers={...options.headers,'x-run21-timing':'1'};
   const sent=performance.now(),response=await fetch0(input,options);if(!action)return response;const json=response.json.bind(response);
   response.json=async()=>{const result=await json(),received=performance.now(),trace=JSON.parse(response.headers.get('x-run21-timing'));const card=result.view?.boards[result.view.viewerId]?.current;
    if(card){const observer=new MutationObserver(()=>{if(document.querySelector('[data-current]')?.getAttribute('data-current')===card.rank+' of '+card.suit){observer.disconnect();const committed=performance.now();requestAnimationFrame(()=>window.samples.push({round:result.view.roundNumber,tap,sent,received,committed,painted:performance.now(),trace}));}});observer.observe(document.body,{subtree:true,attributes:true});}
    return result;};return response;};
 },f.session);
 const page=await context.newPage();page.on('pageerror',error=>console.log('Browser error:',error.message));
 for(let round=1;round<=4;round++){
  m=e.prepareRound(m,round===1?row.first_round_id:randomUUID(),m.rounds.at(-1)?.id??null,fixtureDeck(standardDeck().filter(c=>['2','3','4','5'].includes(c.rank)),17),at);
  command(human.id,{type:'ready'});await commit();
  runtime=createRun21Handler({url,key});runtime.authority.now=()=>at;
  await page.goto('http://127.0.0.1:65432/');await page.waitForFunction(round=>window.snapshot?.view?.roundNumber===round&&window.snapshot?.view?.boards[window.snapshot.view.viewerId]?.current,round);
  for(let n=0;n<12;n++){
   const snap=await page.evaluate(()=>window.snapshot),intent=n===2?{type:'pass'}:chooseAction(snap.view,at).intent;
   assert(['place','pass'].includes(intent.type));const before=await page.evaluate(()=>window.samples.length);
   await page.getByRole('button',{name:intent.type==='pass'?'Pass':`Column ${intent.column}`,exact:true}).click();
   await page.waitForFunction(count=>window.samples.length>count,before);
  }
  if(round===4)await page.screenshot({path:'qualification.local/hook-smoke.png'});evidence.samples.push(...await page.evaluate(()=>window.samples));fs.writeFileSync('qualification.local/timing.json',JSON.stringify(evidence,null,2));
  await page.goto('about:blank');runtime.dispose();
  const latest=await f.admin.rpc('run21_server_load_current',{p_game_id:row.game_id,p_after_sequence:null});row=latest.data.at(-1);m=row.state;
  command(human.id,{type:'expire'},m.rounds.at(-1).boards[human.id].deadline);at=m.rounds.at(-1).scorePresentation.endsAt;m=e.advanceScorePresentation(m,at);
  for(let n=0;n<12;n++)command(bot.id,chooseAction(e.project(m,bot.id),at).intent);
  command(bot.id,{type:'expire'},m.rounds.at(-1).boards[bot.id].deadline);at=m.rounds.at(-1).scorePresentation.endsAt;m=e.advanceScorePresentation(m,at);
  for(const player of m.players)command(player.id,{type:'acknowledge'});await commit();
 }
 assert.equal(evidence.samples.length,48);
 const summary=[];const stats=values=>{const a=values.sort((a,b)=>a-b);return {p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};};
 for(let round=1;round<=4;round++){const a=evidence.samples.filter(x=>x.round===round);summary.push({round,n:a.length,authorization:stats(a.map(x=>{const p=x.trace.phases.find(p=>p.name==='authorization');return p.completedAt-p.startedAt;})),commit:stats(a.map(x=>x.trace.rpc.filter(p=>p.name==='run21_server_commit').reduce((n,p)=>n+p.completedAt-p.startedAt,0))),handler:stats(a.map(x=>x.trace.sentAt-x.trace.receivedAt)),frame:stats(a.map(x=>x.painted-x.received)),tap:stats(a.map(x=>x.painted-x.tap))});}
 evidence.summary=summary;evidence.cleanup=true;fs.writeFileSync('qualification.local/timing.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(summary));
}finally{runtime?.dispose();await browser?.close();server.closeAllConnections();server.close();await vite.close();await f.cleanup();}
