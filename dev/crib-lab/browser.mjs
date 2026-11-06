import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^crib_lab_v1_\d+$/.test(database??''))throw Error('Expected disposable database');
const c=await connect(database),actor=randomUUID(),out='qualification.local/crib-lab/browser';
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/crib-lab/browser-client.ts');
const entry='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/dev/crib-lab/browser-entry.tsx"></script></body></html>';
const server=await createServer({configFile:false,cacheDir:'qualification.local/crib-lab/vite',plugins:[react(),{name:'lab-preview',configureServer(s){
  s.middlewares.use(async(req,res,next)=>{
    const path=req.url?.split('?')[0];
    if(!/^\/arcade(?:\/crib-lab(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
  });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{entries:['dev/crib-lab/browser-entry.tsx']},
  define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
  server:{hmr:false,watch:null,host:'127.0.0.1',port:15369,strictPort:true}});
let browser;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Lab '+actor.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=true where id='crib-lab/1'");
  await server.listen();
  const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
  const rpc=async(name,args)=>{
    assert.ok(['arcade_start','arcade_load','arcade_crib_lab_step','arcade_leaderboard'].includes(name));
    const entries=Object.entries(args);
    const sql='select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result';
    return (await c.query(sql,entries.map(([,value])=>value))).rows[0].result;
  };
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[],log=[],layouts=[],played=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.addInitScript(id=>sessionStorage.setItem('lab-proof-user',id),actor);
  let apiLane=Promise.resolve();
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/fixture/rpc')return route.fulfill({json:{durationMs:240000,version:'crib-lab/1'}});
    if(url.pathname!=='/api/arcade')return route.continue();
    const req=route.request().postDataJSON();
    apiLane=apiLane.then(async()=>{
      try{
        if(req.op==='start')await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
        const value=await arcadeOperation(rpc,actor,'Lab',req);
        log.push([req.op,req.intent?.type,value.phase,value.revision]);
        await route.fulfill({json:value});
      }catch(e){console.error(e.message);await route.fulfill({status:409,json:{error:e.message}});}
    });
    return apiLane;
  });
  const button=name=>page.getByRole('button',{name,exact:true});
  const phase=p=>page.locator('.lab-table[data-phase="'+p+'"]');
  const action=async(name)=>{const confirmed=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');await button(name).click();assert.equal((await confirmed).status(),200);};
  const card=async(h,i,commit=true)=>{
    const el=page.locator('.lab-row').nth(h).locator('.lab-card').nth(i);
    const ack=commit?page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action'):null;
    await el.click();if(ack)assert.equal((await ack).status(),200);
  };
  await page.goto('http://127.0.0.1:15369/arcade');
  const tile=page.getByRole('link',{name:'Crib Lab leaderboard'});
  await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
  await button('Crib Lab rules and info').click();await page.getByText('Mark two cards in each row.',{exact:false}).waitFor();
  await page.keyboard.press('Escape');await tile.click();await button('Play').click();
  await phase('discard').waitFor();await page.waitForTimeout(1100);
  for(const [width,height] of [[390,844],[320,568],[844,390],[667,375],[768,1024],[1280,720]]){
    await page.setViewportSize({width,height});
    const sample=await page.evaluate(()=>{
      const rect=e=>{const {left,top,right,bottom,width,height}=e.getBoundingClientRect();return {left,top,right,bottom,width,height};};
      return {card:rect(document.querySelector('.lab-card')),rows:[...document.querySelectorAll('.lab-row')].map(rect),
        controls:rect(document.querySelector('.lab-controls')),full:document.querySelector('.lab-scene').scrollHeight};
    });
    assert.equal(sample.rows.length,5);assert.ok(sample.card.width>=23&&sample.card.height>=32,JSON.stringify({width,height,sample}));
    assert.ok(sample.controls.bottom<=height+1&&sample.full<=height+1,JSON.stringify({width,height,sample}));
    layouts.push({width,height,card:sample.card});if(width===390||width===844)await page.screenshot({path:out+'/discard-'+width+'.png'});
  }
  await page.setViewportSize({width:390,height:844});
  for(let round=1;round<=3;round++){
    await phase('discard').waitFor();assert.equal(await phase('discard').getAttribute('data-round'),String(round));
    await card(0,0);
    if(round===1){
      played.push(...await page.evaluate(()=>window.audioEvents));
      await page.reload();await phase('discard').waitFor();
      assert.equal(await page.locator('.lab-row').first().locator('[aria-pressed=true]').count(),1);
      assert.deepEqual(await page.evaluate(()=>window.audioEvents),[]);
      await button('Crib Lab rules and info').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
    }
    await card(0,1);
    for(let h=1;h<5;h++){await card(h,0);await card(h,1);}
    await action('Lock Discards');await phase('stock').waitFor();
    if(round===1){
      await page.screenshot({path:out+'/stock.png'});
      await button('Mute sounds').click();const before=await page.evaluate(()=>window.audioEvents.length);
      await action('Pass');assert.equal(await page.evaluate(()=>window.audioEvents.length),before);
      await button('Unmute sounds').click();
    }else await action('Pass');
    await card(0,0);await card(0,1);await action('Pass');await action('Pass');
    await phase('swap').waitFor();await card(0,0,false);await card(1,0,false);
    await button('Cancel').click();assert.equal(await page.locator('.lab-card[aria-pressed=true]').count(),0);
    await card(0,0,false);await card(1,0,false);await action('Confirm Swap');
    await page.getByText('2 swaps left').waitFor();await page.waitForTimeout(250);
    await action('Stand Pat');await phase('scoring').waitFor();
    await page.getByText(/Hand 1 · .* points/).waitFor();
    if(round===1)await page.screenshot({path:out+'/scoring.png'});
    if(round===2){
      await page.getByText(/Hand 3 · .* points/).waitFor();
      played.push(...await page.evaluate(()=>window.audioEvents));
      await page.reload();await phase('scoring').waitFor();
      await page.getByText('Round award',{exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.audioEvents),[]);
    }
  }
  await page.getByText('Game Over',{exact:true}).waitFor({timeout:18000});
  await page.getByRole('tab',{name:'All Time'}).click();await page.locator('.leaderboard-achieved').waitFor();
  const saved=(await c.query("select score,final_state,completed_at from private.arcade_results where user_id=$1 and game='crib-lab'",[actor])).rows;
  assert.equal(saved.length,1);assert.equal(saved[0].final_state.results.length,3);
  assert.equal(await page.locator('.arcade-score-table tbody tr').first().locator('td').last().textContent(),Number(saved[0].score).toLocaleString('en-US'));
  played.push(...await page.evaluate(()=>window.audioEvents));assert.deepEqual(errors,[]);
  writeFileSync(out+'/audio.json',JSON.stringify(played,null,2));
  for(const id of [':deal:','palette:triInvalid:','palette:slide:',':in',':out',':cut','cribbageHighlight','crib-lab:count:', 'scorePost'])assert.ok(played.some(e=>e.includes(id)),id+' missing '+JSON.stringify(played));
  for(const round of [1,2,3])assert.ok(played.some(id=>id.includes(':'+round+':deal:')),'missing live deal for round '+round);
  for(const round of [1,3])for(let hand=0;hand<5;hand++)assert.ok(played.some(id=>id.endsWith(':'+round+':hand:'+hand)));
  assert.equal(new Set(played).size,played.length);
  writeFileSync(out+'/result.json',JSON.stringify({layouts,played,requests:log.length,rounds:saved[0].final_state.results.map(r=>[r.base,r.multiplier,r.award,r.cumulative])},null,2));
  console.log('PASS — switchboard, rules, play, restored selections, six viewports, mute, confirmed/cancelled exchanges, all live cues and three scoring sequences through timestamped leaderboard.');
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
