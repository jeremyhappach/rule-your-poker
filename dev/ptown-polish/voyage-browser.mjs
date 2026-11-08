// Local SQL-backed preview and acceptance harness. Never connects to hosted data.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';
const database=process.argv[2]??JSON.parse(readFileSync('qualification.local/ptown-polish/context.json')).database;
if(!/^ptown_polish_\d+$/.test(database))throw Error('Disposable database required');
const preview=process.argv.includes('--preview'),port=preview?15380:15381,origin='http://127.0.0.1:'+port;
const c=await connect(database),actor=randomUUID(),out='qualification.local/ship-cap-voyage/browser';mkdirSync(out,{recursive:true});
let operation,queue=Promise.resolve(),latest,browser;
const errors=[],requests=[];
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem('lab-proof-user',${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/ship-cap-voyage/browser-entry.tsx"></script></body></html>`;
const fixture=resolve('dev/ship-cap-voyage/browser-client.ts');
const server=await createServer({configFile:false,cacheDir:'qualification.local/ship-cap-voyage/vite-'+port,plugins:[react(),{name:'voyage-local',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];
 if(path==='/api/arcade'||path==='/fixture/rpc'){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'||req.headers.host!=='127.0.0.1:'+port||(req.headers.origin&&req.headers.origin!==origin)){res.statusCode=403;return res.end('{}');}
  try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('request size');}const body=JSON.parse(raw);
   if(path==='/fixture/rpc')return res.end(JSON.stringify({layout:{originals:['ship-cap-voyage','horses-blitz'],other:[]},revision:1}));
   if(req.headers.authorization!=='Bearer '+actor||body.game!=='ship-cap-voyage')throw Error('unavailable');
   const pending=queue.then(()=>operation(body));queue=pending.catch(()=>{});return res.end(JSON.stringify(await pending));
  }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}));}
 }
 if(path==='/'){res.writeHead(302,{Location:'/arcade/ship-cap-voyage'});return res.end();}
 if(!/^\/arcade(?:\/ship-cap-voyage(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
 res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},optimizeDeps:{entries:['dev/ship-cap-voyage/browser-entry.tsx']},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"preview"',__APP_BUILD_SHA__:'"preview"',__BUILD_TIMESTAMP__:'"local"'},server:{host:'127.0.0.1',port,strictPort:true,cors:false,hmr:false,watch:null}});
try{
 await c.query('begin');
 await c.query('insert into auth.users(id) values($1)',[actor]);
 await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
 await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Voyage preview']);
 await c.query("update private.arcade_rulesets set enabled=true where id='ship-cap-voyage/1'");
 if(!preview){
  // Deterministic fair-die fixture for repeatable UI screenshots; all scoring stays in SQL.
  const definition=(await c.query("select pg_get_functiondef('private.ship_cap_voyage_action(jsonb,text,integer[],bigint)'::regprocedure) d")).rows[0].d;
  await c.query(definition.replace('get_byte(extensions.gen_random_bytes(1),0)','(ARRAY[5,4,3,5,5])[i+1]'));
 }
 await server.listen();const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
 const rpc=async(name,args)=>{assert.ok(['arcade_start','arcade_load','arcade_ship_cap_voyage_step','arcade_leaderboard'].includes(name));const entries=Object.entries(args);return (await c.query('select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v))).rows[0].result;};
 operation=async(body)=>{await c.query('savepoint request');try{if(body.op==='start')await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");const result=await arcadeOperation(rpc,actor,'Voyage preview',body);if(result.roundId)latest=result;requests.push({op:body.op,action:body.intent?.type,revision:result.revision});await c.query('release savepoint request');return result;}catch(e){await c.query('rollback to request');await c.query('release savepoint request');throw e;}};
 if(preview){console.log('SQL-backed local preview: '+origin+'/arcade/ship-cap-voyage');await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});}
 else{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(origin+'/arcade');
  const tile=page.getByRole('link',{name:'Ship Cap Voyage leaderboard'});await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
  const box=await tile.boundingBox();assert.ok(Math.abs(box.width/box.height-1466/564)<.02);
  await page.screenshot({path:out+'/01-lobby.png'});
  await page.getByRole('button',{name:'Ship Cap Voyage rules and info'}).click();await page.getByText('30 points per unused roll',{exact:false}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
  await tile.click();await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.getByRole('button',{name:'Roll (1)',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.scv-actions button:last-child').disabled);
  assert.equal(latest.roll,0);assert.deepEqual(latest.dice,[]);assert.deepEqual(await page.locator('.scv-tray').evaluate(n=>({background:getComputedStyle(n).backgroundColor,border:getComputedStyle(n).borderTopWidth,shadow:getComputedStyle(n).boxShadow})),{background:'rgba(0, 0, 0, 0)',border:'0px',shadow:'none'});await page.screenshot({path:out+'/02-manual-opening.png'});
  if(process.argv.includes('--offers')){
   await c.query("update private.arcade_runs set state=state||'{\"roll\":8,\"dice\":[6,5,4,3,3],\"locked\":[0,1,2],\"cargo\":6}'::jsonb where id=$1",[latest.id]);
   await page.reload();await page.locator('.scv-bank').waitFor();await page.setViewportSize({width:320,height:568});
   const definition=(await c.query("select pg_get_functiondef('private.ship_cap_voyage_action(jsonb,text,integer[],bigint)'::regprocedure) d")).rows[0].d;
   await c.query(definition.replace('(ARRAY[5,4,3,5,5])[i+1]','(ARRAY[5,4,3,2,2])[i+1]'));
   const quotes=[];
   for(const left of [3,2,1]){
    const previous=latest.quote.points;
    if(left===2)await c.query(definition);
    await page.locator('.scv-actions button').last().click();await page.waitForFunction(()=>document.querySelectorAll('.scv-die[data-rolling=true]').length>0);await page.waitForFunction(()=>document.querySelectorAll('.scv-die[data-rolling=true]').length===0);
    assert.equal(latest.roll,12-left);const settled=latest.quote.points;const shown=Number((await page.locator('.scv-bank strong').textContent()).replaceAll(',',''));assert.ok(shown>=Math.min(previous,settled)&&shown<=Math.max(previous,settled));assert.notEqual(shown,settled,'offer still animates after dice settle');
    const style=await page.locator('.scv-rolls-left strong').evaluate(n=>({color:getComputedStyle(n).color,animation:getComputedStyle(n).animationDuration}));assert.equal(await page.locator('.scv-rolls-left').getAttribute('data-left'),String(left));assert.equal(style.animation,left===3?'0s':left===2?'1.5s':'0.65s');quotes.push({left,previous,settled,shown,style});
    if(left===1){await page.locator('.scv-bank').click();await page.waitForFunction(()=>document.querySelectorAll('.scv-manifest article b').length===3&&document.querySelector('.scv-manifest article b').textContent.includes('PTS'));assert.equal(latest.banks[0].points,settled);}
    else{await page.waitForTimeout(950);await page.screenshot({path:out+'/rolls-left-'+left+'.png'});await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.scv-rolls-left strong').evaluate(n=>getComputedStyle(n).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});}
   }
   assert.ok(quotes[0].settled<quotes[0].previous&&quotes[1].settled>quotes[1].previous&&quotes[2].settled<quotes[2].previous);assert.deepEqual(errors,[]);writeFileSync(out+'/offer-evidence.json',JSON.stringify({passed:true,quotes},null,2));console.log('PASS Voyage rising/falling full offers, mid-count Bank, last three roll states and reduced motion');
  }else{
  let expected=0;
  for(let round=1;round<=3;round++){
   if(round>1){await page.waitForFunction(n=>document.querySelector('.scv-status strong')?.textContent==='ROUND '+n+' OF 3',round);await page.waitForFunction(()=>!document.querySelector('.scv-actions button:last-child').disabled);assert.equal(latest.roll,0);assert.deepEqual(latest.dice,[]);}
   for(let bank=0;bank<3;bank++){
    const before=requests.filter(x=>x.action==='roll').length;
    await page.locator('.scv-actions button').last().click({clickCount:3});
    await page.waitForFunction(()=>document.querySelectorAll('.scv-die[data-rolling=true]').length>0);
    assert.equal(await page.locator('.scv-die[data-locked=true][data-rolling=true]').count(),0);
    if(round===1&&bank===0)await page.screenshot({path:out+'/03-rolling.png'});
    await page.waitForFunction(()=>document.querySelectorAll('.scv-die[data-rolling=true]').length===0);
    assert.equal(requests.filter(x=>x.action==='roll').length,before+1);
    assert.equal(latest.cargo,12);assert.equal(latest.roll,bank+1);
    if(bank===0){await page.waitForFunction(()=>document.querySelectorAll('.scv-qualified-die .q-die').length===3);if(round===1)await page.screenshot({path:out+'/04-cargo.png'});}
    await page.getByRole('button',{name:/Bank Cargo/}).click({clickCount:3});
    await page.waitForFunction(n=>document.querySelectorAll('.scv-manifest article b').length===3&&Array.from(document.querySelectorAll('.scv-manifest article b')).filter(el=>el.textContent.includes('PTS')).length===n,bank+1);
    assert.equal(latest.banks.length,bank+1);assert.equal(latest.roll,bank+1);assert.equal(latest.cargo,null);await page.waitForTimeout(350);
   }
   expected+=3300;assert.equal(latest.score,expected);
   await page.waitForTimeout(1600);
   if(round===1)await page.screenshot({path:out+'/05-round-countup.png'});
   if(round<3)await page.waitForFunction(()=>document.querySelector('.scv-actions button:last-child')&&!document.querySelector('.scv-actions button:last-child').disabled);
  }
  await page.locator('.scv-final').waitFor();await page.waitForTimeout(3200);assert.equal(await page.getByLabel('Grand total').textContent(),'9,900');assert.equal(await page.locator('.scv-final dl>div').count(),3);
  await page.screenshot({path:out+'/06-final-scoreboard.png'});
  const completedUrl=page.url(),completedId=latest.id,actionsBefore=requests.filter(x=>x.op==='action').length;assert.equal(await page.locator('.scv-final button').count(),0);
  const audio=await page.evaluate(()=>window.audioEvents);writeFileSync(out+'/audio.json',JSON.stringify(audio,null,2));assert.equal(audio.filter(id=>id.startsWith('run21-bell:ship-cap-voyage:')).length,3);assert.equal(audio.filter(id=>id.startsWith('palette:cupRoll:')).length,9);assert.equal(audio.filter(id=>id.startsWith('voyage-bank:')).length,9);assert.equal(audio.filter(id=>id.startsWith('voyage:')&&id.includes(':qualify:')).length,9);assert.equal(audio.filter(id=>id.startsWith('palette:diceMany:')).length,9);
  const layouts=[];
  for(const [width,height] of [[320,568],[390,844],[412,915],[844,390],[1280,720]]){await page.setViewportSize({width,height});const bounds=await page.locator('.scv-grand').boundingBox();assert.ok(bounds.y+bounds.height<=height+1,JSON.stringify({width,height,bounds}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);layouts.push({width,height,final:true});}
  await page.waitForURL(origin+'/arcade/ship-cap-voyage?result='+completedId);assert.equal(requests.filter(x=>x.op==='action').length,actionsBefore);await page.goto(completedUrl);await page.waitForURL(origin+'/arcade/ship-cap-voyage?result='+completedId);assert.equal((await c.query('select count(*)::int n from private.arcade_results where run_id=$1',[completedId])).rows[0].n,1);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Play Again',exact:true}).click();await page.getByRole('button',{name:'Roll (1)',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.scv-actions button:last-child').disabled);
  for(const [width,height] of [[320,568],[390,844],[412,915],[844,390],[1280,720]]){await page.setViewportSize({width,height});const bounds=await page.locator('.scv-actions').boundingBox();assert.ok(bounds.y+bounds.height<=height+1,JSON.stringify({width,height,bounds}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const collisions=await page.evaluate(()=>{const rows=[...document.querySelector('.scv-board').children].filter(e=>!e.classList.contains('scv-intro')).map(e=>e.getBoundingClientRect());return rows.slice(1).some((r,i)=>r.top<rows[i].bottom-1);});assert.equal(collisions,false,'board rows overlap '+width);layouts.push({width,height,playing:true});await page.screenshot({path:out+'/layout-'+width+'.png'});}
  await page.getByRole('button',{name:'Mute sounds',exact:true}).click();const count=await page.evaluate(()=>window.audioEvents.length);await page.getByRole('button',{name:'Roll (1)',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.scv-die[data-rolling=true]').length===0);assert.equal(await page.evaluate(()=>window.audioEvents.length),count);
  await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('heading',{name:'Ship Cap Voyage'}).waitFor();
  assert.deepEqual(errors,[]);writeFileSync(out+'/evidence.json',JSON.stringify({passed:true,score:expected,manualRolls:9,bells:3,cupSounds:9,landings:9,layouts,errors,fixture:'Deterministic dice only; actual SQL rules, RPCs, receipts and leaderboard'},null,2));console.log('PASS three rounds, manual rolls, rapid taps, bells/audio/mute, scoreboard reload, abandon, layouts');
  }
 }
}catch(e){console.error(JSON.stringify({latest,errors,requests:requests.slice(-5)}));throw e;}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
