import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^drop357_v1_\d+$/.test(database??''))throw Error('Expected disposable database');
const polish=process.argv.includes('--polish'),preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15379,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/drop357/'+(polish?'polish-browser':'browser');
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/drop357/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem("lab-proof-user",${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/drop357/browser-entry.tsx"></script></body></html>`;
const errors=[],log=[],layouts=[],played=[],receipts=new Map();
let latest;
const server=await createServer({configFile:false,cacheDir:'qualification.local/drop357/vite-'+port,plugins:[react(),{name:'lab-preview',configureServer(s){
  s.middlewares.use(async(req,res,next)=>{
    const path=req.url?.split('?')[0];
    if(path==='/api/arcade'||path==='/fixture/rpc'){
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      if(req.method!=='POST'||(req.headers.origin&&req.headers.origin!==origin)||req.headers.host!=='127.0.0.1:'+port){
        res.statusCode=403;return res.end('{}');
      }
      try{
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('request too large');}
        const input=JSON.parse(raw);
        if(path==='/fixture/rpc'){
          if(input.name!=='arcade_rules_help')throw Error('unsupported fixture read');
          const {rows}=await c.query("select config from private.arcade_rulesets where game='357-drop' and id=$1",[input.args.p_ruleset]);
          return res.end(JSON.stringify(rows[0]?.config??null));
        }
        if(!operation||req.headers.authorization!=='Bearer '+actor||input.game!=='357-drop')throw Error('unavailable');
        const response=apiLane.then(()=>operation(input));apiLane=response.catch(()=>{});
        return res.end(JSON.stringify(await response));
      }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}));}
    }
    if(preview&&path==='/'){res.writeHead(302,{Location:'/arcade/357-drop'});return res.end();}
    if(!/^\/arcade(?:\/357-drop(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
  });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{entries:['dev/drop357/browser-entry.tsx']},
  define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
  server:{hmr:false,watch:null,host:'127.0.0.1',cors:false,port,strictPort:true}});
let browser;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Lab '+actor.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=false where game='357-drop' and enabled");
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[polish?'drop357/2':'357-drop/1']);
  await server.listen();
  const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
  const rpc=async(name,args)=>{
    assert.ok(['arcade_start','arcade_load','arcade_drop357_step','arcade_leaderboard'].includes(name));
    const entries=Object.entries(args);
    const sql='select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result';
    return (await c.query(sql,entries.map(([,value])=>value))).rows[0].result;
  };
  operation=async input=>{
    await c.query('savepoint local_request');
    try{
      if(input.op==='start')await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
      const value=await arcadeOperation(rpc,actor,'Lab',input);
      if(!preview){
        if(value.roundId)latest=value;
        if(value.result)receipts.set(value.round,value.result);
        log.push([input.op,input.intent?.type,value.phase,value.revision]);
      }
      await c.query('release savepoint local_request');return value;
    }catch(e){await c.query('rollback to local_request');await c.query('release savepoint local_request');throw e;}
  };
  if(preview){
    console.log('Local Crib Lab preview: '+origin+'/arcade/357-drop');
    await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});
  }else{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const button=name=>page.getByRole('button',{name,exact:true});
  const phase=p=>page.locator('.lab-table[data-phase="'+p+'"]');
  const action=async(name)=>{const confirmed=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');await button(name).click();assert.equal((await confirmed).status(),200);};
  const card=async(h,i,commit=true)=>{
    const el=page.locator('.lab-row').nth(h).locator('.lab-card').nth(i);
    const ack=commit?page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action'):null;
    await el.click();if(ack)assert.equal((await ack).status(),200);
  };
  await page.goto(origin+'/arcade');
  const tile=page.getByRole('link',{name:'357 Drop leaderboard'});
  await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
  await button('357 Drop rules and info').click();await page.getByText('One deck. Three lanes.',{exact:false}).waitFor();
  await page.keyboard.press('Escape');await tile.click();await button('Play').click();

  await page.locator('.drop357-lane').first().waitFor();
  for(const [width,height] of [[320,568],[375,667],[390,844],[667,375],[844,390],[1280,720]]){
   await page.setViewportSize({width,height});
   const bounds=await page.locator('.drop357-lane,.drop357-slot,.drop357-current,.drop357-pass').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert.ok(bounds.every(r=>r.x>=-1&&r.y>=-1&&r.x+r.w<=width+1&&r.y+r.h<=height+1&&r.w>0&&r.h>0),JSON.stringify({width,height,bounds}));
   layouts.push({width,height,slots:await page.locator('.drop357-slot').count()});
   await page.screenshot({path:out+'/board-'+width+'.png'});
  }
  await page.setViewportSize({width:390,height:844});
  const prefix=[5,18,2,12,25,51,11,24,34,35,36,37,38,31,26],deck=[...prefix,...Array.from({length:52},(_,i)=>i).filter(i=>!prefix.includes(i))];
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('deck',$2::jsonb,'current',$3::integer) where id=$1",[latest.id,JSON.stringify(deck),deck[0]]);
  await page.reload();await page.locator('.drop357-lane').first().waitFor();
  await action('Place in 3 lane');
  await page.waitForFunction(()=>window.audioEvents.some(id=>id.startsWith('357-action:')));
  assert.equal(latest.placements,1);const original=latest;
  await page.reload();await page.locator('.drop357-lane').first().waitFor();
  assert.equal(latest.placements,1);assert.equal(latest.deadline,original.deadline);
  let dropReplies=2;
  const loseReply=async route=>{const input=route.request().postDataJSON();if(input.op==='action'&&input.intent.type==='place'&&dropReplies>0){dropReplies--;await route.fetch();await route.abort('failed');}else await route.continue();};
  await page.route('**/api/arcade',loseReply);
  await button('Place in 3 lane').click();
  await button('Reconnect').waitFor();
  await page.unroute('**/api/arcade',loseReply);
  const confirmed=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');
  await button('Reconnect').click();assert.equal((await confirmed).status(),200);
  assert.equal(latest.placements,2);
  await action('Place in 3 lane');
  assert.ok(await button('Place in 3 lane').isDisabled());
  for(let i=0;i<5;i++)await action('Place in 5 lane');
  for(let i=0;i<6;i++)await action('Place in 7 lane');
  await new Promise(resolve=>setTimeout(resolve,1200));
  const beforePass=await page.evaluate(()=>window.audioEvents.filter(id=>id.startsWith('357-action:')).length);
  await action('PASS · 3');
  await page.waitForFunction(n=>window.audioEvents.filter(id=>id.startsWith('357-action:')).length>n,beforePass);
  await button('Mute sounds').click();await button('Unmute sounds').waitFor();
  const muted=await page.evaluate(()=>window.audioEvents.length);
  await action('PASS · 2');assert.equal(await page.evaluate(()=>window.audioEvents.length),muted);
  await button('Unmute sounds').click();await button('Mute sounds').waitFor();
  await action('PASS · 1');
  assert.ok(await button('PASS · 0').isDisabled());
  await action('Place in 7 lane');
  assert.equal(latest.status,'completed');assert.equal(latest.placements,15);
  await page.waitForFunction(()=>window.audioEvents.some(id=>id.startsWith('357-filled:')));
  assert.equal(latest.result.allBonus,200);
  assert.ok(latest.laneResults.every(r=>r.natural));
  await page.screenshot({path:out+'/completed.png'});
  await button('Play Again').waitFor({timeout:12000});
  assert.equal((await c.query('select count(*)::int n from private.arcade_results where user_id=$1',[actor])).rows[0].n,1);
  await button('Play Again').click();await page.locator('.drop357-lane').first().waitFor();
  await button('Abandon').click();await button('Keep Playing').click();assert.equal(latest.status,'active');
  await button('Abandon').click();await action('Abandon');await button('Play Again').waitFor();
  assert.equal((await c.query('select count(*)::int n from private.arcade_results where user_id=$1',[actor])).rows[0].n,1);
  await button('Play Again').click();await page.locator('.drop357-lane').first().waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint+5500)) where id=$1",[latest.id]);
  await page.reload();await page.locator('.drop357-lane').first().waitFor();
  await page.getByRole('heading',{name:'357 DROP',exact:true}).click();
  await button('Play Again').waitFor({timeout:14000});
  assert.equal((await c.query('select count(*)::int n from private.arcade_results where user_id=$1',[actor])).rows[0].n,2);
  const beeps=await page.evaluate(()=>window.audioEvents.filter(id=>id.includes(':countdown:')));
  assert.equal(beeps.length,3);
  assert.deepEqual(errors,[]);
  writeFileSync(out+'/browser.json',JSON.stringify({passed:true,layouts,log,audio:await page.evaluate(()=>window.audioEvents)},null,2));
  console.log('PASS: first placement/pass audio and mute; full Arcade flow, 15 placements, 3 last-slot passes, six layouts, reload, ranking and abandon');
  }
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
