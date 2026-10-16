import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {chromium} from '@playwright/test';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {artworkTransport} from './artwork.transport.mjs';
const completion=process.argv.includes('--completion');
const shared=process.argv.includes('--shared-rules'),scoring=shared||process.argv.includes('--scoring'),currentRules=shared?'run21/2':'run21/arcade-2',prefix='presentation-';
const database='arcade_browser_'+Date.now(),opts={host:'127.0.0.1',port:55439,user:'tri_test'},root=new pg.Client({...opts,database:'template1'});await root.connect();await root.query('CREATE DATABASE '+database+' TEMPLATE postgres');
const db=new pg.Client({...opts,database});await db.connect();const user=randomUUID();
await db.query("CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);CREATE SCHEMA IF NOT EXISTS cron;CREATE TABLE IF NOT EXISTS cron.job(jobid bigserial,jobname text,schedule text,active boolean);CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$INSERT INTO cron.job(jobname,schedule,active) VALUES($1,$2,true) RETURNING jobid$$");
await db.query(readFileSync('supabase/arcade/phase-one.sql','utf8'));await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Arcade Browser',true)",[user]);
if(scoring){await db.query(readFileSync('supabase/arcade/run21-scoring.sql','utf8'));await db.query(readFileSync('supabase/arcade/activate-run21-scoring.sql','utf8'));}
if(shared){await db.query(readFileSync('supabase/run21/shared-rules-base.sql','utf8').replace(/\r\n/g,'\n'));await db.query(readFileSync('supabase/run21/shared-rules.candidate.sql','utf8'));await db.query(readFileSync('supabase/run21/activate-shared-rules.sql','utf8'));}
if(completion)await db.query(readFileSync('supabase/arcade/completion.sql','utf8'));
await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp();CREATE FUNCTION private.arcade_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_notify('arcade_local',NEW.run_id::text);RETURN NEW;END$$;CREATE TRIGGER arcade_local AFTER UPDATE ON public.arcade_revisions FOR EACH ROW EXECUTE FUNCTION private.arcade_local_notify()");
const listener=new pg.Client({...opts,database});await listener.connect();await listener.query('LISTEN arcade_local');
const streams=new Set();listener.on('notification',()=>{for(const res of streams)res.write('data: revision\n\n');});
let server,operation,recover;
const artwork=await artworkTransport(db,async()=>{const c=new pg.Client({...opts,database});await c.connect();return c;},user);
const rpc=async(name,args)=>{const c=new pg.Client({...opts,database});await c.connect();try{const keys=Object.keys(args);return(await c.query('SELECT public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;}finally{await c.end();}};
const plugin={name:'arcade-local-proof',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__artwork'){await artwork(req,res);return;}
 if(req.url==='/__arcade-events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 if(req.url==='/api/arcade'){try{let raw='';for await(const chunk of req)raw+=chunk;assert.equal(req.headers.authorization,'Bearer '+user);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await operation(rpc,user,'Arcade Browser',JSON.parse(raw))));}catch(e){res.statusCode=409;res.end(JSON.stringify({error:e.message}));}return;}
 if(req.url?.startsWith('/arcade')){let html=readFileSync('dev/arcade/live.html','utf8').replace('<head>','<head><script>window.__ARCADE_USER__='+JSON.stringify(user)+'</script>');res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,html));return;}next();
});}};
server=await createServer({configFile:false,cacheDir:'qualification.local/arcade-ui-vite',plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/arcade/local-client.ts')},{find:'@/hooks/useAuthGuard',replacement:resolve('dev/arcade/local-auth.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5187,strictPort:true}});
const service=await server.ssrLoadModule('/server/arcade/service.ts');operation=service.arcadeOperation;recover=service.recoverArcade;await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],passed=[];
let recovering=false;
const worker=setInterval(async()=>{if(recovering)return;recovering=true;const token=randomUUID();try{await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);await recover(rpc,token);}catch(e){errors.push('worker: '+e.message);}finally{recovering=false;}},1000);
try{
 mkdirSync('dev/arcade/evidence',{recursive:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('requestfailed',r=>console.error('failed',r.url(),r.failure()));
 await page.route(url=>url.host!=='127.0.0.1:5187',route=>route.fulfill({status:200,body:'[]'}));
 await page.addInitScript(()=>{window.__TOTAL_HOLDS__=[];let current=null;new MutationObserver(()=>{const visible=!!document.querySelector('[data-arcade-completion]');if(visible&&current===null){current=performance.now();}else if(!visible&&current!==null){window.__TOTAL_HOLDS__.push(performance.now()-current);current=null;}}).observe(document,{childList:true,subtree:true});});
 await page.goto('http://127.0.0.1:5187/arcade',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('heading',{name:'Arcade Mode'}).waitFor();assert.equal(await page.getByText('Coming Soon',{exact:true}).count(),2);
 await page.getByRole('button',{name:'Run21 rules and info'}).click();
 await page.getByText('The 106.8-second speed timer starts when the round introduction ends.',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/arcade');
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#edc56e';ctx.fillRect(0,0,120,80);return c.toDataURL('image/png').split(',')[1];}),'base64');
 await page.getByLabel('Upload artwork',{exact:true}).setInputFiles({name:'art.png',mimeType:'image/png',buffer:png});
 await page.getByLabel('Replace artwork',{exact:true}).waitFor();
 const stored=(await db.query("SELECT object_path FROM public.arcade_game_artwork WHERE game='run21'")).rows[0].object_path;assert(stored);
 await page.evaluate(()=>window.__FAIL_UPLOAD__=true);
 await page.getByLabel('Replace artwork',{exact:true}).setInputFiles({name:'art.png',mimeType:'image/png',buffer:png});
 await page.getByRole('alert').filter({hasText:'previous artwork is unchanged'}).waitFor();
 assert.equal((await db.query("SELECT object_path FROM public.arcade_game_artwork WHERE game='run21'")).rows[0].object_path,stored);
 await page.evaluate(()=>window.__FAIL_UPLOAD__=false);
 await page.getByLabel('Replace artwork',{exact:true}).setInputFiles({name:'art.png',mimeType:'image/png',buffer:png});
 await page.waitForFunction(()=>document.querySelector('input[type=file]')?.disabled===false);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.arcade-artwork').waitFor();
 assert.equal(await page.getByRole('button',{name:'Run21 rules and info'}).evaluate(e=>e===document.activeElement),true);
 const replacement=(await db.query("SELECT object_path FROM public.arcade_game_artwork WHERE game='run21'")).rows[0].object_path;assert.notEqual(replacement,stored);
 assert.equal((await db.query("SELECT count(*)::int n FROM storage.objects WHERE name=$1",[stored])).rows[0].n,0);
 await page.reload();await page.locator('.arcade-artwork').waitFor();
 for(const size of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
  await page.setViewportSize(size);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('.arcade-tile p').first().evaluate(e=>e.scrollWidth<=e.clientWidth),'Run21 description must fit');
  for(const tile of await page.locator('.arcade-tile').all()){const box=await tile.boundingBox();assert(box.height<=100);}
  await page.screenshot({path:'dev/arcade/evidence/polish-switchboard-'+size.width+'.png'});
 }
 passed.push('compact phone/landscape/desktop cards with and without artwork; isolated info control and focus return; persisted admin upload, replacement, failure preservation and old-file cleanup');
 const normal=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[normal]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Artwork normal',true)",[normal]);
 await page.addInitScript(id=>window.__ARTWORK_ACTOR__=id,normal);
 await page.reload();await page.locator('.arcade-artwork').waitFor();
 await page.getByRole('button',{name:'Run21 rules and info'}).click();await page.locator('[data-run21-scoring-reference]').waitFor();
 assert.equal(await page.locator('input[type=file]').count(),0);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 passed.push('normal user sees persisted image and rules but no upload control');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('link',{name:'Run21 leaderboard'}).focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('[data-run21-round-intro]').waitFor();assert.equal(await page.getByText('YOUR TURN',{exact:true}).count(),0);
 assert.equal(await page.getByRole('link',{name:'Leaderboard',exact:true}).count(),0);
 await page.locator('[data-run21-gameplay]').waitFor();await page.waitForTimeout(2800);
 assert.equal(await page.getByRole('button',{name:/pause|next round/i}).count(),0);
 if(scoring){
  const untouched=(await db.query('SELECT state FROM private.arcade_runs WHERE user_id=$1 AND status=\'active\'',[user])).rows[0].state;
  assert.equal(untouched.board.startedAt,untouched.updatedAt+2500);
  assert.equal(untouched.board.deadline-untouched.board.startedAt,106800);
  assert.equal(untouched.board.firstPlacementDeadline,null);
  const speed=Number(await page.locator('[data-run21-speed]').getAttribute('data-run21-speed'));
  assert(speed<=280&&speed>260);passed.push('clock starts at intro end before any placement and displays the configured ticks');
 }
 await page.locator('.run21-column').first().click();await page.waitForTimeout(250);
 const first=(await db.query('SELECT state,revision FROM private.arcade_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[user])).rows[0];
 assert(first.state.board.startedAt);const deadline=first.state.board.deadline;
 await page.screenshot({path:'dev/arcade/evidence/'+prefix+'phone.png'});
 await page.reload();await page.locator('[data-run21-gameplay]').waitFor();
 assert.equal((await db.query('SELECT state FROM private.arcade_runs WHERE user_id=$1 AND status=\'active\'',[user])).rows[0].state.board.deadline,deadline);
 passed.push('phone action and reload preserve actual deadline, no pause or Next Round');
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(350);await page.screenshot({path:'dev/arcade/evidence/'+prefix+'desktop.png'});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);await page.screenshot({path:'dev/arcade/evidence/'+prefix+'landscape.png'});
 assert(await page.locator('.run21-collect-button').isVisible());
 // Give Up is the existing zero-score end-round action, distinct from abandoning this run.
 await page.getByRole('button',{name:/Give Up/}).click();await page.waitForTimeout(5500);
 await page.getByText('Round 2 of 3',{exact:true}).waitFor();passed.push('automatic round progression uses authoritative hold and normal intro');
 await page.waitForTimeout(2600);await page.locator('.run21-column').first().click();await page.getByRole('button',{name:/Give Up/}).click();
 await page.waitForTimeout(5500);await page.getByText('Round 3 of 3',{exact:true}).waitFor();
 await page.waitForTimeout(2600);await page.locator('.run21-column').first().click();await page.getByRole('button',{name:/Give Up/}).click();
 if(completion){await page.locator('[data-arcade-completion]').waitFor({timeout:10000});const appeared=Date.now();assert.equal(await page.getByText('NEW PERSONAL BEST!',{exact:true}).count(),0);assert.equal((await db.query('SELECT status FROM private.arcade_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[user])).rows[0].status,'completed');await page.screenshot({path:'dev/arcade/evidence/completion-first.png'});await page.locator('[data-arcade-completion]').waitFor({state:'detached'});assert((await page.evaluate(()=>window.__TOTAL_HOLDS__.at(-1)))>=2400);passed.push('first-score total holds 2.5 seconds after immediate persistence, without record celebration');}
 await page.getByRole('button',{name:'Play Again'}).waitFor({timeout:15000});assert.equal(await page.getByText('Run complete',{exact:true}).count(),1);
 assert.equal((await db.query('SELECT count(*)::int count FROM private.arcade_results WHERE user_id=$1',[user])).rows[0].count,1);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:'dev/arcade/evidence/'+prefix+'leaderboard.png',fullPage:true});passed.push('exactly three rounds, one result, same leaderboard and Play Again');
 if(completion){
  for(const scenario of ['broken','matched','reload','reconnect']){
   await page.getByRole('button',{name:'Play Again'}).click();await page.locator('[data-run21-gameplay]').waitFor();
   const run=(await db.query("SELECT * FROM private.arcade_runs WHERE user_id=$1 AND status='active'",[user])).rows[0];
   const state=structuredClone(run.state);state.round=3;state.roundId=run.id+':3';state.status='completed';state.score=100;
   const result={reason:'collect',score:100,at:Date.now(),aggregate:100,totals:[20,20,20,20,20],aceElevations:[],multiplier:200,speed:.5};
   state.results=[{...result,score:0},{...result,score:0},result];state.board.result=result;
   state.presentation={startedAt:Date.now(),endsAt:Date.now()+1200,from:0,to:100};
   await rpc('arcade_commit',{p_actor:user,p_run:run.id,p_revision:run.revision,p_state:state,p_due:null});
   if(scenario==='reload'){await page.reload();await page.getByRole('button',{name:'Play Again'}).waitFor();assert.equal(await page.locator('[data-arcade-completion]').count(),0);continue;}
   if(scenario==='reconnect'){await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByRole('button',{name:'Play Again'}).waitFor();assert.equal(await page.locator('[data-arcade-completion]').count(),0);continue;}
   await page.locator('[data-arcade-completion]').waitFor();assert.equal(await page.getByText('NEW PERSONAL BEST!',{exact:true}).count(),scenario==='broken'?1:0);
   if(scenario==='broken'){for(const size of [{width:320,height:640},{width:844,height:390}]){await page.setViewportSize(size);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'dev/arcade/evidence/completion-record-'+size.width+'.png'});}}
   await page.getByRole('button',{name:'Play Again'}).waitFor();
  }
  passed.push('prominent strict new record, tied-score suppression, phone/landscape overlay, refresh and reconnect do not replay');
 }
 if(scoring){
  await page.getByRole('button',{name:'Run21 rules and info'}).click();
  await page.getByRole('combobox',{name:'Leaderboard rules'}).selectOption('run21/arcade-1');
  await page.getByText('The 250-second speed timer starts when you place your first card.',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Leaderboard rules'}).selectOption(currentRules);
  await page.getByText('The 106.8-second speed timer starts when the round introduction ends.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  passed.push('legacy and current boards remain separate, info reads the selected frozen rules');
 }
 await page.getByRole('button',{name:'Play Again'}).click();await page.locator('[data-run21-gameplay]').waitFor();
 await page.goto('http://127.0.0.1:5187/arcade/run21');await page.getByRole('link',{name:'Resume',exact:true}).click();await page.locator('[data-run21-gameplay]').waitFor();passed.push('header Resume restores the existing run');
 await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('button',{name:'Abandon Run',exact:true}).click();
 await page.getByText('Run ended · Unranked',{exact:true}).waitFor();passed.push('explicit abandonment returns unranked without a result');
 await page.route('**/api/arcade',async route=>{if(route.request().postDataJSON().op!=='leaderboard')return route.continue();const response=await route.fetch(),data=await response.json();data.self={runId:'self',userId:user,name:'Arcade Browser',score:0,rank:14};data.rows=Array.from({length:10},(_,i)=>({runId:'row-'+i,userId:'fixture-'+i,name:i===0?'A long player name for layout coverage':'Player '+(i+1),score:10000-i*100,rank:i+1}));await route.fulfill({response,json:data});});
 await page.reload();await page.getByText('You · #14 · 0',{exact:true}).waitFor();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'dev/arcade/evidence/presentation-dense-'+width+'.png',fullPage:true});}
 await page.getByRole('tab',{name:'Last 30 Days'}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'All Time'}).getAttribute('aria-selected'),'true');passed.push('dense 10-row display, long names, own rank outside top 10 and keyboard period switching');
 assert.deepEqual(errors,[]);writeFileSync(completion?'dev/arcade/completion-browser.evidence.json':'dev/arcade/presentation-browser.evidence.json',JSON.stringify({passed,productionWrites:0,transport:'Loopback SQL with substitute authentication, Storage bytes and realtime notifications',errors},null,2));console.log(passed);
}catch(e){console.error(e);console.error(errors);for(const context of browser.contexts())for(const page of context.pages()){console.error(await page.locator('body').innerText());await page.screenshot({timeout:5000,animations:'disabled',path:'dev/arcade/evidence/'+prefix+'failure.png'});}throw e;}finally{clearInterval(worker);while(recovering)await new Promise(r=>setTimeout(r,100));await browser.close();for(const res of streams)res.end();await server.close();await listener.end();await db.end();await root.query('DROP DATABASE '+database+' WITH(FORCE)');await root.end();}

