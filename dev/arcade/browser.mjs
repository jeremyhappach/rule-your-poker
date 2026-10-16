import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {chromium} from '@playwright/test';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const shared=process.argv.includes('--shared-rules'),scoring=shared||process.argv.includes('--scoring'),currentRules=shared?'run21/2':'run21/arcade-2',prefix=shared?'shared-':scoring?'scoring-':'';
const database='arcade_browser_'+Date.now(),opts={host:'127.0.0.1',port:55439,user:'tri_test'},root=new pg.Client({...opts,database:'template1'});await root.connect();await root.query('CREATE DATABASE '+database+' TEMPLATE postgres');
const db=new pg.Client({...opts,database});await db.connect();const user=randomUUID();
await db.query("CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);CREATE SCHEMA IF NOT EXISTS cron;CREATE TABLE IF NOT EXISTS cron.job(jobid bigserial,jobname text,schedule text,active boolean);CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$INSERT INTO cron.job(jobname,schedule,active) VALUES($1,$2,true) RETURNING jobid$$");
await db.query(readFileSync('supabase/arcade/phase-one.sql','utf8'));await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Arcade Browser',true)",[user]);
if(scoring){await db.query(readFileSync('supabase/arcade/run21-scoring.sql','utf8'));await db.query(readFileSync('supabase/arcade/activate-run21-scoring.sql','utf8'));}
if(shared){await db.query(readFileSync('supabase/run21/shared-rules-base.sql','utf8').replace(/\r\n/g,'\n'));await db.query(readFileSync('supabase/run21/shared-rules.candidate.sql','utf8'));await db.query(readFileSync('supabase/run21/activate-shared-rules.sql','utf8'));}
await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp();CREATE FUNCTION private.arcade_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_notify('arcade_local',NEW.run_id::text);RETURN NEW;END$$;CREATE TRIGGER arcade_local AFTER UPDATE ON public.arcade_revisions FOR EACH ROW EXECUTE FUNCTION private.arcade_local_notify()");
const listener=new pg.Client({...opts,database});await listener.connect();await listener.query('LISTEN arcade_local');
const streams=new Set();listener.on('notification',()=>{for(const res of streams)res.write('data: revision\n\n');});
let server,operation,recover;
const rpc=async(name,args)=>{const c=new pg.Client({...opts,database});await c.connect();try{const keys=Object.keys(args);return(await c.query('SELECT public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;}finally{await c.end();}};
const plugin={name:'arcade-local-proof',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__arcade-events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 if(req.url==='/api/arcade'){try{let raw='';for await(const chunk of req)raw+=chunk;assert.equal(req.headers.authorization,'Bearer '+user);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await operation(rpc,user,'Arcade Browser',JSON.parse(raw))));}catch(e){res.statusCode=409;res.end(JSON.stringify({error:e.message}));}return;}
 if(req.url?.startsWith('/arcade')){let html=readFileSync('dev/arcade/live.html','utf8').replace('<head>','<head><script>window.__ARCADE_USER__='+JSON.stringify(user)+'</script>');res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,html));return;}next();
});}};
server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/arcade/local-client.ts')},{find:'@/hooks/useAuthGuard',replacement:resolve('dev/arcade/local-auth.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5187,strictPort:true}});
const service=await server.ssrLoadModule('/server/arcade/service.ts');operation=service.arcadeOperation;recover=service.recoverArcade;await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],passed=[];
let recovering=false;
const worker=setInterval(async()=>{if(recovering)return;recovering=true;const token=randomUUID();try{await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);await recover(rpc,token);}catch(e){errors.push('worker: '+e.message);}finally{recovering=false;}},1000);
try{
 mkdirSync('dev/arcade/evidence',{recursive:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('requestfailed',r=>console.error('failed',r.url(),r.failure()));
 await page.route('**/*',route=>new URL(route.request().url()).host==='127.0.0.1:5187'?route.continue():route.fulfill({status:200,body:'[]'}));
 await page.goto('http://127.0.0.1:5187/arcade',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Arcade Mode'}).waitFor();assert.equal(await page.getByText('Coming Soon',{exact:true}).count(),2);
 await page.getByRole('link',{name:'Play Run21'}).click();await page.getByRole('button',{name:'Play',exact:true}).click();
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
 await page.getByRole('button',{name:'Play Again'}).waitFor({timeout:15000});assert.equal(await page.getByText('Run complete',{exact:true}).count(),1);
 assert.equal((await db.query('SELECT count(*)::int count FROM private.arcade_results WHERE user_id=$1',[user])).rows[0].count,1);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:'dev/arcade/evidence/'+prefix+'leaderboard.png',fullPage:true});passed.push('exactly three rounds, one result, same leaderboard and Play Again');
 if(scoring){
  await page.getByRole('combobox',{name:'Leaderboard rules'}).selectOption('run21/arcade-1');
  await page.getByText('Viewing legacy scores. New games use '+currentRules+'.',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Leaderboard rules'}).selectOption(currentRules);
  await page.waitForTimeout(200);passed.push('legacy and current leaderboards are independently selectable');
 }
 await page.getByRole('button',{name:'Play Again'}).click();await page.locator('[data-run21-gameplay]').waitFor();
 await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('button',{name:'Abandon Run',exact:true}).click();
 await page.getByText('Run ended · Unranked',{exact:true}).waitFor();passed.push('explicit abandonment returns unranked without a result');
 assert.deepEqual(errors,[]);writeFileSync('dev/arcade/'+prefix+'browser.evidence.json',JSON.stringify({passed,productionWrites:0,transport:'Loopback SQL with substitute authentication and realtime notifications',errors},null,2));console.log(passed);
}catch(e){console.error(errors);for(const context of browser.contexts())for(const page of context.pages()){console.error(await page.locator('body').innerText());await page.screenshot({path:'dev/arcade/evidence/'+prefix+'failure.png'});}throw e;}finally{clearInterval(worker);while(recovering)await new Promise(r=>setTimeout(r,100));await browser.close();for(const res of streams)res.end();await server.close();await listener.end();await db.end();await root.query('DROP DATABASE '+database+' WITH(FORCE)');await root.end();}

