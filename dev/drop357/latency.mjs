import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^drop357_v2_\d+$/.test(database??''))throw Error('Expected disposable database');
const polish=process.argv.includes('--polish'),preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15378,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/drop357/'+'latency-after';
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/drop357/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem("lab-proof-user",${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/drop357/browser-entry.tsx"></script></body></html>`;
const errors=[],log=[],layouts=[],played=[],receipts=new Map(),rpcTimes=[];
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
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",['357-drop/2']);
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
      const started=performance.now();const value=await arcadeOperation(rpc,actor,'Lab',input);if(input.op==='action')rpcTimes.push({type:input.intent.type,ms:performance.now()-started,placements:value.placements});
      if(!preview){
        if(value.roundId)latest=value;
        if(value.result)receipts.set(value.round,value.result);
        log.push([input.op,input.intent?.type,value.phase,value.revision]);
      }
      await c.query('release savepoint local_request');return value;
    }catch(e){await c.query('rollback to local_request');await c.query('release savepoint local_request');throw e;}
  };
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const button=name=>page.getByRole('button',{name,exact:true});
  const action=async(name)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');await button(name).click();assert.equal((await response).status(),200);};
  const playing=round=>page.locator('.drop357-page[data-round="'+round+'"][data-phase="playing"]').waitFor({timeout:14000});
  const seed=async()=>{const prefix=latest.round===3?[50,10,49,0,14,28,43,6,34,35,36,37,38,31,26]:[50,10,49,9,22,35,3,11,34,36,37,38,31,26,12],deck=[...prefix,...Array.from({length:52},(_,i)=>i).filter(i=>!prefix.includes(i))];await c.query("update private.arcade_runs set state=state||jsonb_build_object('deck',$2::jsonb,'current',$3::integer) where id=$1",[latest.id,JSON.stringify(deck),deck[0]]);const originalDeadline=latest.deadline;await page.reload();await playing(latest.round);assert.equal(latest.deadline,originalDeadline);await page.getByRole('heading',{name:'357 DROP',exact:true}).click();};
  const tally=async()=>{
   await page.locator('.tri-score-pill[data-centered="true"]').waitFor();
   await page.screenshot({path:out+'/tally-'+latest.round+'.png'});
   await page.locator('.drop357-page[data-phase="stage_complete"] .tri-score-pill[data-centered="false"]').waitFor({timeout:7000});
   await page.waitForFunction(()=>{const el=document.querySelector('.drop357-page[data-phase=stage_complete] .tri-score-pill');if(!el)return false;const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return Math.abs(m.m41)<1&&Math.abs(m.m42)<1&&Math.abs(m.a-1)<.01;});
   const geometry=await page.locator('.tri-score-pill').evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {x:Math.abs(m.m41),y:Math.abs(m.m42),scale:m.a};});
   assert.ok(geometry.x<1&&geometry.y<1&&Math.abs(geometry.scale-1)<.01,'pill returns home '+JSON.stringify(geometry));
  };
  await page.goto(origin+'/arcade');const tile=page.getByRole('link',{name:'357 Drop leaderboard'});await tile.click();
  await button('357 Drop rules and info').click();await page.getByText('Three rounds per game.',{exact:false}).waitFor();await page.keyboard.press('Escape');await button('Play').click();
  await playing(1);

  await page.setViewportSize({width:390,height:844});await seed();
  const samples=[];
  const measure=async lane=>{
   await page.evaluate(()=>{const current=document.querySelector('.drop357-current').innerHTML;window.tapProbe={at:performance.now()};document.addEventListener('pointerdown',()=>{window.tapProbe.at=performance.now();},{once:true,capture:true});const observer=new MutationObserver(()=>{if(document.querySelector('.drop357-current')?.innerHTML!==current){observer.disconnect();requestAnimationFrame(()=>{window.tapProbe.paintMs=performance.now()-window.tapProbe.at;});}});observer.observe(document.body,{subtree:true,childList:true,characterData:true});});
   const started=performance.now();await action('Place in '+lane+' lane');await page.waitForFunction(()=>window.tapProbe.paintMs!=null);
   samples.push({lane,httpAndClickMs:performance.now()-started,...await page.evaluate(()=>window.tapProbe)});
  };
  await measure(3);await measure(3);await measure(3);
  const rowClosed=latest.placements;await measure(5);assert.equal(latest.placements,rowClosed+1);
  let delayOne=true,committed;const commit=new Promise(resolve=>committed=resolve);let release;
  const hold=new Promise(resolve=>release=resolve);
  const delayed=async route=>{if(route.request().postDataJSON().op==='action'&&delayOne){delayOne=false;const response=await route.fetch();committed();await hold;await route.fulfill({response});}else await route.continue();};
  await page.route('**/api/arcade',delayed);
  const targets=await page.locator('.drop357-lane').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
  const before=latest.placements,started=performance.now();
  await page.evaluate(()=>{window.pendingPaint=null;document.addEventListener('pointerdown',()=>{const at=performance.now();const observer=new MutationObserver(()=>{if(document.querySelector('[data-pending=true]')){observer.disconnect();requestAnimationFrame(()=>window.pendingPaint=performance.now()-at);}});observer.observe(document.body,{subtree:true,attributes:true,childList:true});},{once:true,capture:true});});
  await page.mouse.click(targets[1].x,targets[1].y);await commit;
  await page.waitForFunction(()=>window.pendingPaint!=null);
  assert.equal(await page.locator('[data-pending=true]').count(),1,'immediate landing while response held');
  await page.mouse.click(targets[2].x,targets[2].y);assert.equal(latest.placements,before+1,'stale tap cannot play unseen next card');
  // Simulate the existing realtime invalidation arriving before the delayed action response.
  await page.evaluate(()=>window.dispatchEvent(new Event('357-proof-change')));
  await page.waitForFunction(()=>!document.querySelector('[data-lane="7"]').disabled);
  await action('Place in 7 lane');assert.equal(latest.placements,before+2,'next known card accepted before old HTTP returns');
  release();await page.waitForTimeout(100);await page.unroute('**/api/arcade',delayed);
  const burst={taps:3,accepted:latest.placements-before,oldResponseHeldUntilNextCardAccepted:true,immediatePaintMs:await page.evaluate(()=>window.pendingPaint),elapsed:performance.now()-started};
  const evidence={mobileViewport:{width:390,height:844},samples,rpcTimes,burst,errors};
  writeFileSync(out+'/latency.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
