// Isolated PostgreSQL clone + real Arcade service, hook, board and audio. No production writes.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const automatic=process.argv.includes('--automatic-timing'),timingUploads=[];
const opts={host:'127.0.0.1',port:55439,user:'tri_test'},database='run21_continuous_'+Date.now();
const connect=async name=>{const c=new pg.Client({...opts,database:name});await c.connect();return c;};
const admin=await connect('postgres');
const source=process.argv[2];
assert(/^(royal_flash|eleven_up)_\d+$/.test(source??''),'Pass an idle local qualification database as the template argument');await admin.query(`CREATE DATABASE ${database} TEMPLATE ${source}`);
const db=await connect(database),listener=await connect(database),user=randomUUID(),streams=new Set(),errors=[],requests=[],rounds=[];
await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Continuous Run21',true)",[user]);
await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(); CREATE OR REPLACE FUNCTION public.continuous_notify() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_notify('continuous_run',NEW.run_id::text);RETURN NEW;END$$; CREATE TRIGGER continuous_notify AFTER UPDATE ON public.arcade_revisions FOR EACH ROW EXECUTE FUNCTION public.continuous_notify()");
if(automatic){await db.query(readFileSync('supabase/migrations/20261019192529_run21_bounded_account_timing.sql','utf8').replace(/SELECT cron.schedule[^\n]+/g,''));await db.query(readFileSync('supabase/migrations/20261019193157_run21_timing_upload_order.sql','utf8'));await db.query("INSERT INTO private.run21_timing_grants VALUES($1,now(),now()+interval '7 days',now()+interval '14 days')",[user]);}
await listener.query('LISTEN continuous_run');listener.on('notification',()=>{for(const res of streams)res.write('data: revision\n\n');});
let operation,recover;
const rpc=async(name,args)=>{const c=await connect(database);try{return(await c.query(`SELECT public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) v`,Object.values(args))).rows[0].v;}finally{await c.end();}};
const plugin={name:'continuous-run-proof',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__timing'){let raw='';for await(const chunk of req)raw+=chunk;const {name,args={}}=JSON.parse(raw);assert(['run21_timing_grant','run21_store_timing'].includes(name));const c=await connect(database);try{await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);const data=(await c.query(`SELECT public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) v`,Object.values(args).map(v=>Array.isArray(v)?JSON.stringify(v):v))).rows[0].v;if(name==='run21_store_timing')timingUploads.push({at:Date.now(),samples:args.p_samples.length,bytes:raw.length});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));}catch(e){errors.push(e.message);res.end(JSON.stringify({data:null,error:{message:e.message}}));}finally{await c.end();}return;}
 if(req.url==='/__artwork'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[],error:null}));return;}
 if(req.url==='/__arcade-events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 if(req.url==='/api/arcade'){const start=performance.now();try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),spans=[];
  const measured=async(name,args)=>{const at=performance.now(),v=await rpc(name,args);spans.push(`${name};dur=${(performance.now()-at).toFixed(2)}`);return v;};
  const value=await operation(measured,user,'Continuous Run21',body),json=JSON.stringify(value);spans.push(`total;dur=${(performance.now()-start).toFixed(2)}`);
  requests.push({op:body.op,id:body.requestId,round:value.view?.roundNumber,bytes:json.length,duration:performance.now()-start,spans});res.setHeader('Server-Timing',spans.join(', '));res.setHeader('Content-Type','application/json');res.end(json);
 }catch(e){errors.push(e.message);res.statusCode=409;res.end(JSON.stringify({error:e.message}));}return;}
 if(req.url?.startsWith('/arcade')){const html=readFileSync('dev/arcade/live.html','utf8').replace('<head>','<head><script>window.__ARCADE_USER__='+JSON.stringify(user)+'</script>');res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,html));return;}next();
});}};
const server=await createServer({configFile:false,cacheDir:'qualification.local/continuous-vite',plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve(automatic?'dev/run21/timing-local-client.ts':'dev/arcade/local-client.ts')},{find:'@/hooks/useAuthGuard',replacement:resolve('dev/arcade/local-auth.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5196,strictPort:true,watch:null,hmr:false}});
({arcadeOperation:operation,recoverArcade:recover}=await server.ssrLoadModule('/server/arcade/service.ts'));const {chooseAction}=await server.ssrLoadModule('/src/lib/run21/bot.ts');await server.listen();
let working=false;const worker=setInterval(async()=>{if(working)return;working=true;try{const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);await recover(rpc,token);}catch(e){errors.push(e.message);}finally{working=false;}},1000);
const browser=await chromium.launch({channel:'msedge',headless:true});mkdirSync('qualification.local/continuous-performance',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 await page.addInitScript(()=>{
  window.__audioStats={contexts:0,started:0,ended:0};const Audio=window.AudioContext;window.AudioContext=class extends Audio{constructor(...args){super(...args);window.__audioStats.contexts++;}createOscillator(){const node=super.createOscillator(),start=node.start.bind(node);node.start=(...args)=>{window.__audioStats.started++;node.addEventListener('ended',()=>window.__audioStats.ended++,{once:true});return start(...args);};return node;}};window.__frames=[];let last=0;const tick=t=>{if(last)window.__frames.push(t-last);if(window.__frames.length>2000)window.__frames.shift();last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  const native=window.fetch;window.fetch=async(...args)=>{const response=await native(...args);if(String(args[0])==='/api/arcade'){const parse=response.json.bind(response);response.json=async()=>{const value=await parse();if(value.view)window.__snapshot=value;return value;};}return response;};
 });
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5196/arcade/run21'+(automatic?'':'?run21Timing=1'),{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'Play',exact:true}).click();
 for(let round=1;round<=3;round++){
  await page.waitForFunction(r=>window.__snapshot?.view.roundNumber===r&&!!document.querySelector('.run21-column:not(:disabled)'),round,{timeout:20000});
  if(automatic&&round===1){await page.waitForFunction(()=>window.__RUN21_TIMINGS__?.length>0,null,{timeout:10000});console.log('Automatic capture active');}
  let moves=0;
  while(moves<45){
   const value=await page.evaluate(()=>window.__snapshot);if(value.view.roundNumber!==round||value.view.boards[value.view.viewerId]?.result)break;
   const choice=chooseAction(value.view,Date.now()).intent;if(!choice||choice.type==='collect')break;
   // Keep round 3 mounted to its late clock with accumulated work from rounds 1/2.
   if(round===3&&moves===5){const deadline=value.view.boards[value.view.viewerId].deadline;const wait=deadline-Date.now()-12000;if(wait>0)await page.waitForTimeout(wait);}
   const target=choice.type==='place'?page.locator('.run21-column').nth(choice.column):page.getByRole('button',{name:'Pass',exact:true});
   if(!await target.isEnabled())break;await target.click();await page.waitForFunction(rev=>window.__snapshot.revision>rev,value.revision);moves++;
   await page.waitForTimeout(150);
  }
  await cdp.send('HeapProfiler.collectGarbage');rounds.push({round,moves,channels:streams.size,dom:await cdp.send('Memory.getDOMCounters'),metrics:(await cdp.send('Performance.getMetrics')).metrics,audio:await page.evaluate(()=>window.__audioStats),frames:await page.evaluate(()=>window.__frames.slice())});
  if(await page.getByRole('button',{name:/Give Up|Take Win/}).count())await page.getByRole('button',{name:/Give Up|Take Win/}).first().click();
  console.log('Completed round',round,'moves',moves,'channels',streams.size);
 }
 await page.getByRole('button',{name:'Play Again',exact:true}).waitFor({timeout:20000});
 assert.equal((await db.query('SELECT count(*)::int n FROM private.arcade_results WHERE user_id=$1',[user])).rows[0].n,1);
 if(automatic){await page.waitForTimeout(31000);const stored=(await db.query('SELECT samples FROM private.run21_timing_captures WHERE user_id=$1',[user])).rows;assert.equal(stored.length,1,JSON.stringify({errors,timingUploads}));assert.deepEqual([...new Set(stored[0].samples.map(s=>s[4]))].filter(Boolean).sort(),[1,2,3]);assert(timingUploads.length>0);}
 const samples=automatic?(await db.query('SELECT samples FROM private.run21_timing_captures WHERE user_id=$1',[user])).rows[0].samples.map(([at,wallAt,stage,id,round,elapsed,server])=>({at,wallAt,stage,id,round,elapsed,server})):await page.evaluate(()=>window.__RUN21_TIMINGS__??[]);
 const hash=text=>{let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return(n>>>0).toString(16).padStart(8,'0');};
 const stats=a=>{a.sort((x,y)=>x-y);return {n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
 const summary=rounds.map(r=>{const actions=requests.filter(x=>x.op==='action'&&x.round===r.round),ids=new Set(actions.map(x=>automatic?hash(x.id):x.id));return {round:r.round,moves:r.moves,channels:r.channels,listeners:r.dom.jsEventListeners,domNodes:r.dom.nodes,audio:r.audio,serverMs:stats(actions.map(x=>x.duration)),bytes:stats(actions.map(x=>x.bytes)),inputToPaintMs:stats(samples.filter(x=>x.stage==='intent'&&ids.has(x.id)).flatMap(x=>{const paint=samples.find(y=>y.id===x.id&&y.stage==='confirmed-paint-opportunity');return paint?[paint.at-x.at]:[];})),framesMs:stats(r.frames)};});
 writeFileSync('qualification.local/continuous-performance/evidence.json',JSON.stringify({environment:'isolated local PostgreSQL clone; production service/client/render/audio, local auth adapter; no WAN or physical Safari measurement',database,automatic,timingUploads,summary,rounds,requests,samples,errors},null,2));console.log(JSON.stringify({automatic,timingUploads,summary,errors}));assert.deepEqual(errors,[]);
}finally{clearInterval(worker);for(const res of streams)res.end();await browser.close();await server.close();await listener.end();await db.end();await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end();}
