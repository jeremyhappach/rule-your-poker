import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^ptown_polish_\d+$/.test(database??''))throw Error('Expected disposable database');
const carry=!process.argv.includes('--original'),polish=process.argv.includes('--polish'),preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15379,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/drop357/'+(carry?'browser-partial':'browser-original');
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
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[carry?'357-drop/5':'357-drop/2']);
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
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const button=name=>page.getByRole('button',{name,exact:true});
  const action=async(name)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');await button(name).click();assert.equal((await response).status(),200);};
  const playing=round=>page.locator('.drop357-page[data-round="'+round+'"][data-phase="playing"]').waitFor({timeout:14000});
  const seed=async()=>{const prefix=carry?(latest.round===1?[22,12,6,1,0,13,26,39,2,9,35,50]:[50,10,49,3,23,36,12,5,9,22,35,48]):latest.round===3?[50,10,49,0,14,28,43,6,34,35,36,37,38,31,26]:[50,10,49,9,22,35,3,11,34,36,37,38,31,26,12],deck=[...prefix,...Array.from({length:52},(_,i)=>i).filter(i=>!prefix.includes(i))];await c.query("update private.arcade_runs set state=state||jsonb_build_object('deck',$2::jsonb,'current',$3::integer) where id=$1",[latest.id,JSON.stringify(deck),deck[0]]);const originalDeadline=latest.deadline;await page.reload();await playing(latest.round);assert.equal(latest.deadline,originalDeadline);await page.getByRole('heading',{name:'357 DROP',exact:true}).click();};
  const tally=async()=>{
   await page.locator('.tri-score-pill[data-centered="true"]').waitFor();
   await page.screenshot({path:out+'/tally-'+latest.round+'.png'});
   await page.locator('.drop357-page[data-phase="stage_complete"] .tri-score-pill[data-centered="false"]').waitFor({timeout:12000});
   await page.waitForFunction(()=>{const el=document.querySelector('.drop357-page[data-phase=stage_complete] .tri-score-pill');if(!el)return false;const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return Math.abs(m.m41)<1&&Math.abs(m.m42)<1&&Math.abs(m.a-1)<.01;});
   const geometry=await page.locator('.tri-score-pill').evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {x:Math.abs(m.m41),y:Math.abs(m.m42),scale:m.a};});
   assert.ok(geometry.x<1&&geometry.y<1&&Math.abs(geometry.scale-1)<.01,'pill returns home '+JSON.stringify(geometry));
  };
  await page.goto(origin+'/arcade');await page.getByRole('link',{name:'Ship Cap Voyage leaderboard'}).waitFor();
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});const tiles=await page.locator('.arcade-banner-tile').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),button=n.querySelector('button'),b=button.getBoundingClientRect();return {height:r.height,width:r.width,hitWidth:b.width,hitHeight:b.height}}));assert.ok(tiles.every(t=>Math.abs(t.height-tiles[0].height)<1&&t.hitWidth>=44&&t.hitHeight>=44),JSON.stringify(tiles));layouts.push({tileWidth:width,tiles});await page.screenshot({path:out+'/lobby-'+width+'.png',fullPage:true});}
  await page.setViewportSize({width:390,height:844});const tile=page.getByRole('link',{name:'357 Drop leaderboard'});await tile.click();
  await button('357 Drop rules and info').click();await page.getByRole('heading',{name:'How to play',exact:true}).waitFor();await page.keyboard.press('Escape');await button('Play').click();
  await playing(1);
  for(const [width,height] of [[320,568],[375,667],[390,844],[667,375],[844,390],[1280,720]]){
   await page.setViewportSize({width,height});
   const bounds=await page.locator('.drop357-lane,.drop357-slot,.drop357-current,.drop357-pass').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert.ok(bounds.every(r=>r.x>=-1&&r.y>=-1&&r.x+r.w<=width+1&&r.y+r.h<=height+1&&r.w>0&&r.h>0),JSON.stringify({width,height,bounds}));
   layouts.push({width,height,slots:await page.locator('.drop357-slot').count()});await page.screenshot({path:out+'/board-'+width+'.png'});
  }
  await page.setViewportSize({width:320,height:568});assert.equal(await page.locator('.drop357-score time').count(),0);assert.ok(await page.locator('meter').getAttribute('aria-valuetext'));
  let total=0;const runId=latest.id;
  for(let round=1;round<=3;round++){
   await playing(round);assert.equal(latest.passesLeft,3);assert.ok(latest.deadline-latest.serverAt>118000);await seed();
   const before=await page.locator('.drop357-lane').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));
   if(carry){
    if(round===1){
     for(const [lane,first,last] of [[5,2,5],[7,3,7],[3,1,3]])for(let slot=first;slot<=last;slot++)await action('Place in '+lane+' lane slot '+slot);
     assert.equal(latest.current,null);assert.equal(latest.phase,'playing');assert.ok(latest.laneResults[0].score>0);assert.equal(latest.laneResults[1],null);
     await page.screenshot({path:out+'/pending-carry-320.png'});
     await button('Carry 3 lane card 2').click();assert.equal(latest.carryChoices[0],null);await button('Carry 3 lane card 1').click();assert.equal(await button('Carry 3 lane card 1').getAttribute('aria-pressed'),'true');await action('Confirm');assert.deepEqual(latest.lanes[1],[9,22,12,6,1]);assert.equal(latest.laneResults[1].natural,false);
     await button('Select carry 5 lane card 1').click();await button('Select carry 5 lane card 2').click();
     await button('Select carry 5 lane card 2').click();assert.ok(await button('Confirm').isDisabled());await button('Select carry 5 lane card 2').click();
     await action('Confirm');assert.equal(latest.result.allBonus,0);assert.deepEqual(latest.lanes[2],[9,22,0,13,26,39,2]);
    }else{
     for(let slot=1;slot<=3;slot++)await action('Place in 3 lane slot '+slot);
     assert.equal(latest.laneResults[0].natural,true);
     // New slots remain playable while the first carry is pending.
     await action('Place in 5 lane slot 2');assert.equal(latest.carryChoices[0],null);
     if(round===2){
      await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint+5500)) where id=$1",[runId]);
      await page.reload();await playing(2);await page.getByRole('heading',{name:'357 DROP',exact:true}).click();
      await page.locator('.drop357-page[data-phase="stage_complete"]').waitFor({timeout:8000});assert.equal(latest.result.timeBonus,0);assert.equal(latest.laneResults[1],null);
     }else{
      await button('Carry 3 lane card 1').click();assert.equal(latest.carryChoices[0],null);await button('Carry 3 lane card 2').click();assert.equal(await button('Carry 3 lane card 2').getAttribute('aria-pressed'),'true');await action('Confirm');for(let slot=3;slot<=5;slot++)await action('Place in 5 lane slot '+slot);
      assert.equal(latest.laneResults[1].natural,false);
      const readable=await page.locator('.drop357-lane-result[data-filled=true]').evaluateAll(rows=>rows.map(row=>({font:parseFloat(getComputedStyle(row.querySelector('b')).fontSize),scoreFont:parseFloat(getComputedStyle(row.querySelector('strong')).fontSize),overflow:row.scrollWidth>row.clientWidth+1})));
      assert.ok(readable.every(x=>x.font>=16&&x.scoreFont>=22&&!x.overflow),JSON.stringify(readable));
      assert.equal(await page.getByLabel('Natural bonus, 20 percent').first().innerText(),'Natty +20%');
      await button('Select carry 5 lane card 1').click();await action('Place in 7 lane slot 3');
      assert.equal(await button('Select carry 5 lane card 1').getAttribute('aria-pressed'),'true','draft survives accepted new placement');
      await button('Select carry 5 lane card 2').click();await page.screenshot({path:out+'/results-320.png'});await action('Confirm');
      for(let slot=4;slot<=6;slot++)await action('Place in 7 lane slot '+slot);
      for(let i=3;i>0;i--)await action('PASS · '+i);await action('Place in 7 lane slot 7');
     }
    }
    if(latest.result.allBonus>0){await page.getByText('ALL FILLED',{exact:true}).waitFor();assert.ok(!await page.evaluate(round=>window.audioEvents.some(id=>id.startsWith('tri-count:357-drop:')&&id.includes(':'+round+':')),round));}
    if(latest.result.allBonus===0)assert.equal(await page.getByText('ALL FILLED',{exact:true}).count(),0);if(latest.result.allBonus===500){await page.waitForFunction(()=>document.querySelector('.drop357-bonus-award')?.textContent==='+500');await page.screenshot({path:out+'/all-filled-500.png'});await page.waitForTimeout(1800);assert.equal(await page.locator('.drop357-bonus-award').innerText(),'+500');}
    total+=latest.result.roundScore;assert.equal(latest.score,total);await tally();
    assert.equal((await c.query('select count(*)::int n from private.arcade_results where run_id=$1',[runId])).rows[0].n,round===3?1:0);
    continue;
   }
   await action('Place in 3 lane');
   if(round===1){
    let drops=2;const lose=async route=>{const input=route.request().postDataJSON();if(input.op==='action'&&input.intent.type==='place'&&drops>0){drops--;await route.fetch();await route.abort('failed');}else await route.continue();};
    await page.route('**/api/arcade',lose);await button('Place in 3 lane').click();
    await page.waitForFunction(()=>!sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('ptown:357-drop:1:'))??'missing'));assert.equal(latest.placements,2);await page.unroute('**/api/arcade',lose);
   }else await action('Place in 3 lane');
   await action('Place in 3 lane');
   assert.ok((await page.locator('.drop357-hand').first().innerText()).includes('Pair of Queens'));
   const after=await page.locator('.drop357-lane').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));assert.deepEqual(before,after);
   if(round===2){
    await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint+5500)) where id=$1",[runId]);
    await page.reload();await playing(2);await page.getByRole('heading',{name:'357 DROP',exact:true}).click();
    await page.locator('.drop357-page[data-phase="stage_complete"]').waitFor({timeout:8000});assert.equal(latest.result.reason,'timeout');assert.equal(latest.result.timeBonus,0);
   }else{
    for(let i=0;i<5;i++)await action('Place in 5 lane');
    if(round===1){
     assert.ok((await page.locator('.drop357-lane-result').nth(1).innerText()).includes('Four Jacks'));
     const readable=await page.locator('.drop357-lane-result[data-filled=true]').evaluateAll(rows=>rows.map(row=>{const name=row.querySelector('b'),score=row.querySelector('strong'),r=row.getBoundingClientRect();return {name:name.textContent,font:parseFloat(getComputedStyle(name).fontSize),scoreFont:parseFloat(getComputedStyle(score).fontSize),overflow:row.scrollWidth>row.clientWidth+1,bottom:r.bottom};}));
     assert.ok(readable.every(x=>x.font>=16&&x.scoreFont>=22&&!x.overflow&&x.bottom<=568),JSON.stringify(readable));
     assert.equal(await page.getByLabel('Natural bonus, 20 percent').first().innerText(),'Natty +20%');
     assert.equal(await page.locator('.drop357-lane').nth(1).locator('.drop357-natty').count(),0);
     layouts.push({readable});await page.screenshot({path:out+'/results-320.png'});
    }
    for(let i=0;i<6;i++)await action('Place in 7 lane');
    if(round===3){await button('Mute sounds').click();const muted=await page.evaluate(()=>window.audioEvents.length);await action('PASS \u00b7 3');assert.equal(await page.evaluate(()=>window.audioEvents.length),muted);await button('Unmute sounds').click();}
    for(let i=round===3?2:3;i>0;i--)await action('PASS \u00b7 '+i);await action('Place in 7 lane');
    assert.equal(latest.result.reason,'filled');assert.equal(latest.result.allBonus,round===3?0:200);
    await page.waitForFunction(()=>window.audioEvents.some(id=>id.startsWith('357-filled:')));
   }
   total+=latest.result.roundScore;assert.equal(latest.score,total);await tally();
   assert.equal((await c.query('select count(*)::int n from private.arcade_results where run_id=$1',[runId])).rows[0].n,round===3?1:0);
  }
  await button('Back to Leaderboard').waitFor({timeout:12000});
  const finalUrl=page.url(),finalRounds=await page.locator('[data-round-score] dd strong').allTextContents();
  assert.deepEqual(finalRounds.map(x=>Number(x.replaceAll(',',''))),[...receipts.values()].map(x=>x.roundScore));
  assert.equal(Number((await page.locator('.arcade-final-total strong').innerText()).replaceAll(',','')),total);
  assert.equal(await page.locator('[data-round-score]').count(),3);
  const actionsBefore=log.filter(x=>x[0]==='action').length;
  await page.waitForTimeout(6000);assert.equal(page.url(),finalUrl);
  await page.screenshot({path:out+'/final-320.png'});
  const events=await page.evaluate(()=>window.audioEvents),bells=events.filter(id=>id.startsWith('run21-bell:tri:357-drop:'));
  assert.equal(bells.length,3,JSON.stringify(bells));assert.equal(new Set(bells).size,3);
  assert.equal(events.filter(id=>id.startsWith('357-filled:')).length,1);
  for(const round of [3]){const full=events.indexOf('357-filled:'+runId+':'+round),count=events.findIndex(id=>id.startsWith('tri-count:357-drop:'+runId+':'+round+':'));assert.ok(full>=0&&count>full,'ALL FILLED precedes count-up');assert.ok(!events.includes('357-lane:'+runId+':'+round+':lane:2'),'no ordinary final-row cue');}

  assert.equal(new Set(events.filter(id=>id.startsWith('tri-count:357-drop:'))).size,3);
  assert.ok(!events.some(id=>id.startsWith('tri-clear:')||id.startsWith('tri-tower:')));
  await page.reload();await button('Back to Leaderboard').waitFor();
  assert.equal(Number((await page.locator('.arcade-final-total strong').innerText()).replaceAll(',','')),total);
  assert.equal(await page.locator('[data-round-score]').count(),3);
  assert.equal((await c.query('select count(*)::int n from private.arcade_results where run_id=$1',[runId])).rows[0].n,1);
  await button('Back to Leaderboard').click();await page.waitForURL(origin+'/arcade/357-drop?result='+runId);
  assert.equal(log.filter(x=>x[0]==='action').length,actionsBefore,'Back button never submits a score');
  await button('Play').click();await playing(1);await button('Abandon').click();await button('Keep Playing').click();await button('Abandon').click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon',exact:true}).click();await button('Play Again').waitFor();
  assert.deepEqual(errors,[]);writeFileSync(out+'/browser.json',JSON.stringify({passed:true,layouts,total,log,audio:events},null,2));console.log('PASS: three rounds, timeout banking, one final result, three bells, distinct filled cues, three count-ups return home, six layouts, bar-only clock and Abandon.');
}catch(e){console.error(JSON.stringify({latest,errors,log:log.slice(-12),audio:browser?await browser.contexts()[0].pages()[0].evaluate(()=>window.audioEvents):[]}));if(browser)await browser.contexts()[0]?.pages()[0]?.screenshot({path:out+'/failure.png'});throw e;}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
