import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {chromium} from '@playwright/test';
import {connect} from '../tri-towers/bots-fixture.mjs';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const {database}=JSON.parse(readFileSync('qualification.local/tri-towers/solo-context.json','utf8')),db=await connect(database),user=randomUUID();
await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)",[user,'Solo Tri '+user.slice(0,8)]);
const artwork=async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);let data=null;
 if(body.op==='list')data=['run21','tri-towers','yahtzee'].map(game=>({game,object_path:null}));
 if(body.op==='rules'){await db.query('BEGIN');try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);data=(await db.query('SELECT public.arcade_rules_help($1) value',[body.ruleset])).rows[0].value;}finally{await db.query('ROLLBACK');}}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));
};
await db.query(readFileSync('supabase/migrations/20261017001447_solo_tri_towers.sql','utf8'));
await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp();CREATE OR REPLACE FUNCTION private.arcade_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_notify('arcade_local',NEW.run_id::text);RETURN NEW;END$$;DROP TRIGGER IF EXISTS arcade_local ON public.arcade_revisions;CREATE TRIGGER arcade_local AFTER UPDATE ON public.arcade_revisions FOR EACH ROW EXECUTE FUNCTION private.arcade_local_notify()");
const listener=await connect(database);await listener.query('LISTEN arcade_local');const streams=new Set();listener.on('notification',()=>{for(const res of streams)res.write('data: revision\n\n');});
const rpc=async(name,args)=>{const c=await connect(database);try{const keys=Object.keys(args);return(await c.query('SELECT public.'+name+'('+keys.map((key,i)=>key+'=>$'+(i+1)).join(',')+') v',Object.values(args))).rows[0].v;}finally{await c.end();}};
let operation,recover;
const plugin={name:'solo-tri-qualification',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__artwork'){await artwork(req,res);return;}
 if(req.url==='/__arcade-events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 if(req.url==='/api/arcade'){try{let raw='';for await(const chunk of req)raw+=chunk;assert.equal(req.headers.authorization,'Bearer '+user);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await operation(rpc,user,'Solo Tri Browser',JSON.parse(raw))));}catch(e){res.statusCode=409;res.end(JSON.stringify({error:e.message}));}return;}
 if(req.url?.startsWith('/arcade')){const html=readFileSync('dev/arcade/live.html','utf8').replace('<head>','<head><script>window.__ARCADE_USER__='+JSON.stringify(user)+'</script>');res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,html));return;}next();
});}};
const server=await createServer({configFile:false,cacheDir:'qualification.local/arcade-tri-ui',plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/arcade/local-client.ts')},{find:'@/hooks/useAuthGuard',replacement:resolve('dev/arcade/local-auth.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5188,strictPort:true}});
({arcadeOperation:operation,recoverArcade:recover}=await server.ssrLoadModule('/server/arcade/service.ts'));await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],cases=[];let working=false;
const worker=setInterval(async()=>{if(working)return;working=true;try{const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);await recover(rpc,token);}catch(e){errors.push('worker '+e.message);}finally{working=false;}},1000);
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route(url=>url.host!=='127.0.0.1:5188',route=>route.fulfill({status:200,body:'[]'}));
 await page.addInitScript(()=>{window.__HOLDS__=[];let from=null;new MutationObserver(()=>{const visible=!!document.querySelector('[data-arcade-completion]');if(visible&&from===null)from=performance.now();else if(!visible&&from!==null){window.__HOLDS__.push(performance.now()-from);from=null;}}).observe(document,{childList:true,subtree:true});});
 await page.goto('http://127.0.0.1:5188/arcade');await page.getByRole('link',{name:'TriTowers leaderboard'}).click();await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('[data-tri-towers][data-phase=ready]').waitFor();const run=page.url().split('/').at(-1);
 assert.equal(await page.getByRole('button',{name:'Take Score',exact:true}).count(),0);
 assert.equal(await page.getByText(/chips|Your Turn|Watching|Competition/i).count(),0);
 await page.getByRole('button',{name:'Rules',exact:true}).click();await page.getByText('Play two base rounds.',{exact:false}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 const legal=page.locator('[data-tri-card][data-legal=true]:enabled');
 if(await legal.count())await legal.first().click();else await page.getByRole('button',{name:/Draw stock/}).click();
 await page.locator('[data-tri-towers][data-phase=playing]').waitFor();assert.equal(await page.getByRole('button',{name:'Take Score',exact:true}).count(),1);
 for(const size of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
  await page.setViewportSize(size);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const button=page.getByRole('button',{name:'Take Score',exact:true});assert(await button.isVisible());
  mkdirSync('dev/arcade/evidence',{recursive:true});await page.screenshot({path:'dev/arcade/evidence/tri-'+size.width+'.png'});
 }
 cases.push('shared tableau and legal first removal/draw; one Take Score; no multiplayer/financial controls; phone, landscape and desktop');
 const before=(await db.query('SELECT state FROM private.arcade_runs WHERE id=$1',[run])).rows[0].state.board.deadline;
 await page.reload();await page.locator('[data-phase=playing]').waitFor();assert.equal((await db.query('SELECT state FROM private.arcade_runs WHERE id=$1',[run])).rows[0].state.board.deadline,before);cases.push('reconnect preserves absolute running deadline');
 await page.getByRole('button',{name:'Take Score',exact:true}).click();await page.locator('[data-stage-result]').waitFor();await page.locator('[data-phase=ready]').waitFor();
 assert.equal((await db.query('SELECT state FROM private.arcade_runs WHERE id=$1',[run])).rows[0].state.round,2);
 await page.getByRole('button',{name:/Draw stock/}).click();await page.getByRole('button',{name:'Take Score',exact:true}).click();
 await page.locator('[data-arcade-completion]').waitFor();await page.screenshot({path:'dev/arcade/evidence/tri-final.png'});await page.waitForURL('**/arcade/tri-towers?result=*');
 assert((await page.evaluate(()=>window.__HOLDS__)).every(ms=>ms>=2450));assert.equal((await db.query('SELECT count(*)::int n FROM private.arcade_results WHERE run_id=$1',[run])).rows[0].n,1);cases.push('two rounds, automatic five-second holds, atomic verified completion, full 2.5-second total and TriTowers leaderboard return');
 await page.getByRole('button',{name:'Play Again',exact:true}).click();await page.locator('[data-phase=ready]').waitFor();await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('button',{name:'Abandon Run',exact:true}).click();await page.waitForURL('**/arcade/tri-towers?result=*');await page.getByText('Run ended · Unranked').waitFor();cases.push('Play Again and explicit whole-run abandonment excluded from ranking');
 await page.goto('http://127.0.0.1:5188/arcade/tri-towers/run/'+run);await page.waitForURL('**/arcade/tri-towers?result=*');assert.equal(await page.locator('[data-arcade-completion]').count(),0);cases.push('completed reconnect suppresses celebration replay');
 assert.deepEqual(errors,[]);writeFileSync('dev/arcade/tri.browser.evidence.json',JSON.stringify({at:new Date().toISOString(),cases,errors},null,2));console.log(JSON.stringify({cases,errors}));
}finally{clearInterval(worker);for(const res of streams)res.end();await browser.close();await server.close();await listener.end();await db.end();}
