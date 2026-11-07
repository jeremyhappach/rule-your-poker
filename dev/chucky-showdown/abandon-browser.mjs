import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';
const database=process.argv[2];
if(!/^chucky_showdown_v3_\d+$/.test(database??''))throw Error('Expected disposable hotfix database');
const actor=randomUUID(),origin='http://127.0.0.1:15479',out='qualification.local/arcade-abandon';
mkdirSync(out,{recursive:true});
let c,operation,lane=Promise.resolve();const requests=[],errors=[],samples=[];
const fixture=resolve('dev/chucky-showdown/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script>sessionStorage.setItem("showdown-local-user",${JSON.stringify(actor)});</script><script type="module" src="/dev/chucky-showdown/browser-entry.tsx"></script></body></html>`;
const server=await createServer({configFile:false,cacheDir:out+'/vite',plugins:[react(),{name:'abandon-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];
 if(path==='/api/arcade'||path==='/fixture/rpc'){
  if(req.method!=='POST'||req.headers.origin!==origin){res.statusCode=403;return res.end();}
  let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('Content-Type','application/json');
  const task=lane.then(async()=>{
   const input=JSON.parse(body);await c.query('savepoint browser_request');
   try{
    let value;
    if(path==='/fixture/rpc'){
     value=input.name==='arcade_rules_help'?(await c.query('select public.arcade_rules_help($1)',[input.args.p_ruleset])).rows[0].arcade_rules_help:null;
    }else{requests.push(input);value=await operation(input);}
    await c.query('release savepoint browser_request');res.end(JSON.stringify(value));
   }catch(e){await c.query('rollback to savepoint browser_request');await c.query('release savepoint browser_request');res.statusCode=409;res.end(JSON.stringify({error:e.message}));console.error(e.message);}
  });lane=task.catch(()=>{});return;
 }
 if(!/^\/arcade(?:\/[^/]+(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
 res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},optimizeDeps:{entries:['dev/chucky-showdown/browser-entry.tsx']},
 define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},server:{hmr:false,watch:null,host:'127.0.0.1',port:15479,strictPort:true}});
let browser;
try{
 await server.listen();const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
 const rpc=async(name,args)=>{
  assert.match(name,/^(arcade_|mega_)/);assert.ok(Object.keys(args).every(k=>/^p_[a-z_]+$/.test(k)));
  const entries=Object.entries(args);
  return (await c.query('select public.'+name+'('+entries.map(([k],i)=>k+'=>$'+(i+1)).join(',')+') r',entries.map(([,v])=>v))).rows[0].r;
 };
 operation=async input=>{
  if(input.op==='start')await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
  return arcadeOperation(rpc,actor,'Local player',input);
 };
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const games=process.argv[3]?.split(',')??['run21','tri-towers','quintzee','boxdrop','trip-flip','take-two','royal-flash','eleven-up','mega-card-golf','crib-lab','chucky-showdown'];
 for(const game of games){
  const db={'boxdrop':'boxdrop_1792512073576','trip-flip':'trip_flip_1792457720139','take-two':'take_two_1792450416066'}[game]??database;
  c=await connect(db);await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  if((await c.query("select to_regclass('public.account_access') r")).rows[0].r)
   await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Hotfix '+actor.slice(0,8)]);
  await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
  if(game==='mega-card-golf')await c.query("update private.arcade_rulesets set enabled=true where id='mega-card-golf/1'");
  await page.goto(origin+'/arcade/'+game);
  if(game==='mega-card-golf'){await page.getByRole('button',{name:'Select Sunny Meadows',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();}
  else await page.getByRole('button',{name:'Play',exact:true}).click();
  const control=page.locator('button.arcade-abandon');await control.waitFor();
  const run=requests.filter(r=>r.op==='state'&&r.game===game).at(-1)?.runId;
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   const box=await control.boundingBox(),header=await control.locator('xpath=ancestor::header').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,paddingTop:parseFloat(s.paddingTop),paddingRight:parseFloat(s.paddingRight)};});
   assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height,JSON.stringify({game,width,box}));
   assert.ok(Math.abs(box.y-header.y-header.paddingTop)<3&&Math.abs(box.x+box.width-header.x-header.width+header.paddingRight)<3,JSON.stringify({game,width,box,header}));
   const before=requests.filter(r=>r.intent?.type==='abandon').length;
   await control.click();const dialog=page.getByRole('alertdialog');await dialog.getByRole('button',{name:/keep playing/i}).click();await dialog.waitFor({state:'hidden'});
   assert.equal(requests.filter(r=>r.intent?.type==='abandon').length,before,'cancel sends no abandon');
   samples.push({game,width,height,box});await page.screenshot({path:out+'/'+game+'-'+width+'.png'});
  }
  await control.click();const dialog=page.getByRole('alertdialog');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().intent?.type==='abandon');
  await dialog.getByRole('button',{name:/^(abandon (game|run)|end game)$/i}).click();
  assert.equal((await response).status(),200);await control.waitFor({state:'hidden'});
  const id=requests.filter(r=>r.intent?.type==='abandon'&&r.game===game).at(-1).runId;
  const row=(await c.query("select status,(select count(*)::int from private.arcade_results where run_id=$1) results from private.arcade_runs where id=$1",[id])).rows[0];
  assert.deepEqual(row,{status:'abandoned',results:0},game);
  writeFileSync(out+'/'+game+'-result.json',JSON.stringify({game,samples:samples.filter(s=>s.game===game),result:row},null,2));
  await page.goto('about:blank');await lane;await c.query('rollback');await c.end();c=null;
  console.log('PASS '+game+' — 3 mobile sizes, cancel, confirmed authoritative abandon, no result.');
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/result.json',JSON.stringify({samples,errors},null,2));
}finally{await browser?.close();await server.close();if(c){await c.query('rollback');await c.end();}}
