import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^crib_lab_v1_\d+$/.test(database??''))throw Error('Expected disposable database');
const polish=process.argv.includes('--polish'),preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15369,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/crib-lab/'+(polish?'polish-browser':'browser');
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/crib-lab/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem("lab-proof-user",${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/crib-lab/browser-entry.tsx"></script></body></html>`;
const errors=[],log=[],layouts=[],played=[],receipts=new Map();
let latest;
const server=await createServer({configFile:false,cacheDir:'qualification.local/crib-lab/vite-'+port,plugins:[react(),{name:'lab-preview',configureServer(s){
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
          const {rows}=await c.query("select config from private.arcade_rulesets where game='crib-lab' and id=$1",[input.args.p_ruleset]);
          return res.end(JSON.stringify(rows[0]?.config??null));
        }
        if(!operation||req.headers.authorization!=='Bearer '+actor||input.game!=='crib-lab')throw Error('unavailable');
        const response=apiLane.then(()=>operation(input));apiLane=response.catch(()=>{});
        return res.end(JSON.stringify(await response));
      }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}));}
    }
    if(preview&&path==='/'){res.writeHead(302,{Location:'/arcade/crib-lab'});return res.end();}
    if(!/^\/arcade(?:\/crib-lab(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
  });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{entries:['dev/crib-lab/browser-entry.tsx']},
  define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
  server:{hmr:false,watch:null,host:'127.0.0.1',cors:false,port,strictPort:true}});
let browser;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Lab '+actor.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=false where game='crib-lab' and enabled");
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[polish?'crib-lab/2':'crib-lab/1']);
  await server.listen();
  const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
  const rpc=async(name,args)=>{
    assert.ok(['arcade_start','arcade_load','arcade_crib_lab_step','arcade_leaderboard'].includes(name));
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
    console.log('Local Crib Lab preview: '+origin+'/arcade/crib-lab');
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
  const tile=page.getByRole('link',{name:'Crib Lab leaderboard'});
  await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
  await button('Crib Lab rules and info').click();await page.getByText('Mark two cards in each row.',{exact:false}).waitFor();
  await page.keyboard.press('Escape');await tile.click();await button('Play').click();
  const selectedCards=page.locator('.lab-card[aria-pressed=true]');
  const goldOnly=async count=>{
    await page.waitForFunction(n=>document.querySelectorAll('.lab-card[aria-pressed=true] [data-playing-card-highlight=gold]').length===n,count);
    assert.equal(await selectedCards.count(),count);
    assert.ok((await selectedCards.allTextContents()).every(t=>!/[−✓]/.test(t)));
  };
  const swapGeometry=()=>page.evaluate(()=>['.lab-controls','.lab-offer','.lab-meter','.lab-rows'].map(s=>{
    const {x,y,width,height}=document.querySelector(s).getBoundingClientRect();return [x,y,width,height];
  }));
  const overlay=page.locator('.lab-overlay');
  const waitPlayable=async p=>{
    await phase(p).waitFor();await overlay.waitFor({state:'hidden'});
    await page.waitForFunction(()=>!!document.querySelector('.lab-card:not(:disabled)'));
  };
  const intro=async(p,round)=>{
    if(!polish)return;
    await overlay.getByText(p+' Phase',{exact:true}).waitFor({timeout:30000});
    assert.ok(await button('Abandon game').isEnabled());
    assert.equal(await page.locator('.lab-card:not(:disabled)').count(),0);
    const paused=await page.locator('.lab-meter').getAttribute('aria-valuenow');
    await page.waitForTimeout(115);
    assert.equal(await page.locator('.lab-meter').getAttribute('aria-valuenow'),paused);
    if(round===1)await page.screenshot({path:out+'/'+p.toLowerCase()+'-phase.png'});
  };
  await intro('Discard',1);
  await waitPlayable('discard');await page.waitForTimeout(1100);
  for(const [width,height] of [[390,844],[320,568],[844,390],[667,375],[768,1024],[1280,720]]){
    await page.setViewportSize({width,height});
    const sample=await page.evaluate(()=>{
      const rect=e=>{const {left,top,right,bottom,width,height}=e.getBoundingClientRect();return {left,top,right,bottom,width,height};};
      const first=s=>rect(document.querySelector(s)),suit=document.querySelector('.lab-card [data-arcade-classic-suit]');
      return {card:first('.lab-card'),rows:[...document.querySelectorAll('.lab-row')].map(rect),meter:first('.lab-meter'),
        round:first('.lab-round'),pill:first('.lab-score'),controls:first('.lab-controls'),full:document.querySelector('.lab-scene').scrollHeight,
        suit:rect(suit),headerTargets:[...document.querySelectorAll('.lab-header button,.lab-header a')].map(rect)};
    });
    assert.equal(sample.rows.length,5);assert.ok(sample.card.width>=23&&sample.card.height>=32,JSON.stringify({width,height,sample}));
    assert.ok(sample.controls.bottom<=height+1&&sample.full<=height+1,JSON.stringify({width,height,sample}));
    assert.ok(sample.meter.top>=sample.rows[4].bottom-1);assert.ok(sample.round.right<=sample.pill.left);
    assert.ok(sample.suit.width>0&&sample.suit.height>0&&sample.suit.bottom<=sample.card.bottom+1);assert.ok(sample.headerTargets.every(t=>t.width>=40&&t.height>=40));
    assert.equal(await page.locator('.lab-hand-label,.lab-factor').count(),0);
    assert.equal(await page.locator('.lab-meter').innerText(),'');assert.ok(!/×\d+|\d:\d\d/.test(await page.locator('.lab-hud').innerText()));
    layouts.push({width,height,card:sample.card});if(width===390||width===844)await page.screenshot({path:out+'/discard-'+width+'.png'});
  }
  await page.setViewportSize({width:390,height:844});
  await button('Abandon game').click();await page.getByRole('alertdialog').waitFor();
  await button('Keep playing').click();assert.equal(log.filter(x=>x[1]==='abandon').length,0);
  const center=async()=>{
    const a=await page.locator('.lab-offer').boundingBox(),b=await page.locator('.lab-controls').boundingBox();
    assert.ok(Math.abs(a.x+a.width/2-b.x-b.width/2)<=1.5,JSON.stringify({a,b}));return page.locator('.lab-offer').evaluate(el=>el.offsetWidth);
  };
  // Record the displayed step and exact card positions for comparison with each stored count receipt.
  const observe=()=>page.evaluate(()=>{
    window.labBeats=[];window.labScores=[];let last='';
    const record=()=>{
      const table=document.querySelector('.lab-table[data-phase=scoring]');if(!table)return;
      const panel=table.querySelector('.lab-breakdown'),base=table.querySelector('.lab-base-counter strong');
      const stage=panel?.dataset.stage??(table.querySelector('.lab-equation')?'equation':'total');
      const gameTotal=Number(table.querySelector('.lab-score strong').textContent.replaceAll(',',''));
      const sample={round:Number(table.dataset.round),stage,base:base?Number(base.textContent):null,gameTotal};
      const previous=window.labScores.at(-1);
      if(!previous||sample.round!==previous.round||sample.stage!==previous.stage||sample.base!==previous.base||sample.gameTotal!==previous.gameTotal)window.labScores.push(sample);
      if(!panel)return;
      const key=[document.querySelector('.lab-table').dataset.round,panel.dataset.stage,panel.dataset.step].join(':');
      if(key===last)return;last=key;
      const row=document.querySelector('.lab-row[data-counting=true]');
      let mask=0;if(row)[...row.querySelectorAll('.lab-card')].forEach((c,i)=>{if(c.dataset.scored==='true')mask|=1<<i;});
      if(document.querySelector('.lab-offer[data-scored=true]'))mask|=16;
      window.labBeats.push({key,mask,text:panel.textContent});
    };
    new MutationObserver(record).observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});record();
  });
  for(let round=1;round<=3;round++){
    if(polish&&round>1)await page.emulateMedia({reducedMotion:round===2?'reduce':'no-preference'});
    if(round>1)await intro('Discard',round);
    await waitPlayable('discard');assert.equal(await phase('discard').getAttribute('data-round'),String(round));
    assert.equal(await page.locator('.lab-row:first-child [data-arcade-classic-suit]').count(),6);
    await card(0,0);
    if(round===1){
      await goldOnly(1);await page.screenshot({path:out+'/discard-picked.png'});
      played.push(...await page.evaluate(()=>window.audioEvents));
      const deadline=latest.deadline;await page.reload();await waitPlayable('discard');
      assert.equal(latest.deadline,deadline);assert.equal(await page.locator('.lab-row').first().locator('[aria-pressed=true]').count(),1);
      assert.deepEqual(await page.evaluate(()=>window.audioEvents),[]);await observe();
      await button('Crib Lab rules and info').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
    }
    await card(0,1);
    for(let h=1;h<5;h++){await card(h,0);await card(h,1);}
    await action('Lock Discards');await intro('Stock',round);
    if(polish&&round===2){
      const deadline=latest.deadline,ends=latest.transition.endsAt;played.push(...await page.evaluate(()=>window.audioEvents));
      await page.reload();await phase('stock').waitFor();
      assert.equal(latest.deadline,deadline);if(latest.transition)assert.equal(latest.transition.endsAt,ends);
      assert.deepEqual(await page.evaluate(()=>window.audioEvents),[]);await observe();
    }
    if(polish&&round===3){
      const deadline=latest.deadline,cdp=await page.context().newCDPSession(page);
      await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
      await new Promise(resolve=>setTimeout(resolve,1400));
      await cdp.send('Page.setWebLifecycleState',{state:'active'});await cdp.detach();
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await waitPlayable('stock');assert.equal(latest.deadline,deadline);
    }
    await waitPlayable('stock');
    assert.equal(await page.locator('.lab-row:first-child [data-arcade-classic-suit]').count(),4);
    const width=await center();
    assert.equal(await page.locator('.lab-phase strong').innerText(),'Draw From Stock');
    for(let offer=5;offer>=1;offer--){
      await page.getByLabel(offer+' stock offers remaining',{exact:true}).waitFor();
      assert.equal(await page.locator('.lab-stock-count').innerText(),String(offer));
      if(offer===5&&round===1){
        await page.screenshot({path:out+'/stock.png'});await button('Mute sounds').click();
        const before=await page.evaluate(()=>window.audioEvents.length);
        await action('Pass');assert.equal(await page.evaluate(()=>window.audioEvents.length),before);await button('Unmute sounds').click();
      }else if(offer===4||offer===3)await card(0,0);else await action('Pass');
    }
    await phase('cut').waitFor();assert.equal(await overlay.count(),0);assert.equal(await page.locator('.lab-stock-count').count(),0);
    const starter=await page.locator('.lab-offer').getAttribute('aria-label');
    assert.ok(Math.abs(await center()-width)<1);
    if(round===1){await page.waitForTimeout(620);await page.screenshot({path:out+'/cut.png'});}
    await intro('Swap',round);await waitPlayable('swap');assert.equal(await page.locator('.lab-offer').getAttribute('aria-label'),starter);
    if(round===1){
      for(const [width,height] of [[320,568],[667,375],[844,390],[768,1024],[390,844]]){
        await page.setViewportSize({width,height});await button('Stand Pat').waitFor();
        const idle=await swapGeometry();
        await card(0,0,false);await goldOnly(1);
        assert.equal(await button('Stand Pat').count(),0);
        assert.ok(await button('Confirm').isDisabled());
        assert.deepEqual(await swapGeometry(),idle,'one pick moved the layout at '+width);
        await card(1,0,false);await goldOnly(2);
        assert.ok(await button('Confirm').isEnabled());assert.equal(await button('Stand Pat').count(),0);
        assert.deepEqual(await swapGeometry(),idle,'two picks moved the layout at '+width);
        await center();
        if(width===390)await page.screenshot({path:out+'/swap.png'});
        await button('Cancel').click();await goldOnly(0);assert.ok(await button('Stand Pat').isEnabled());
        assert.deepEqual(await swapGeometry(),idle,'cancel moved the layout at '+width);
      }
    }
    await card(0,0,false);await card(1,0,false);await action('Confirm');
    await page.getByText('2 swaps left').waitFor();await page.waitForTimeout(270);
    await action('Stand Pat');await phase('scoring').waitFor();
    const receipt=receipts.get(round);
    assert.ok(receipt);
    assert.ok(!(await page.locator('.lab-hud').innerText()).includes('GAME TOTAL'));
    if(polish){
      assert.ok(receipt.presentation.beats.filter(b=>b.kind!=='subtotal').every(b=>b.ms===450));
      await page.locator('.lab-breakdown[data-stage=combo]').waitFor();
      if(round===1)await page.screenshot({path:out+'/scoring.png'});
      if(round===2){
        await page.waitForTimeout(1450);
        assert.equal(await page.locator('.lab-flight').evaluateAll(nodes=>nodes.flatMap(n=>n.getAnimations()).length),0);
        played.push(...await page.evaluate(()=>window.audioEvents));
        const previous=await page.locator('.lab-breakdown').getAttribute('data-step');
        await page.reload();await phase('scoring').waitFor();await observe();
        assert.equal(latest.result.scoredAt,receipt.scoredAt);
        assert.ok(Number(await page.locator('.lab-breakdown').getAttribute('data-step'))>=Number(previous));
        // A reloaded PWA needs a fresh trusted gesture on platforms that suspend Web Audio.
        await page.locator('.lab-round').click();
      }

    }else if(round===2){
      await page.waitForTimeout(1600);played.push(...await page.evaluate(()=>window.audioEvents));await page.reload();
      await observe();
    }
    const equation=page.locator('.lab-equation');
    await equation.waitFor({timeout:60000});
    if(polish){
      if(round===2){
        const after=await page.evaluate(()=>window.audioEvents);assert.ok(after.every(id=>!played.includes(id)),'historical scoring cue replay');
      }
      else {
        const records=await page.evaluate(()=>window.labBeats);
        for(const step of receipt.presentation.beats){
          const stage=step.kind==='subtotal'?'subtotal':'combo',key=round+':'+stage+':'+step.at;
          const drawn=records.filter(b=>b.key===key);assert.equal(drawn.length,1,key);
          assert.equal(drawn[0].mask,step.mask,key);
        }
      }
    }else if(round===2)assert.deepEqual(await page.evaluate(()=>window.audioEvents),[]);
    assert.deepEqual(await equation.locator('strong').allTextContents(),[String(receipt.base),String(receipt.multiplier),receipt.award.toLocaleString('en-US')]);
    assert.equal(await page.locator('.lab-score strong').innerText(),receipt.before.toLocaleString('en-US'));
    if(polish&&round===1)await page.screenshot({path:out+'/equation.png'});
    await equation.waitFor({state:'hidden'});
    await page.waitForFunction(({score,round})=>document.querySelector('.lab-table')?.dataset.round===String(round)&&
      document.querySelector('.lab-score strong')?.textContent===score,{score:receipt.cumulative.toLocaleString('en-US'),round});
    const samples=await page.evaluate(round=>window.labScores.filter(s=>s.round===round),round);
    assert.ok(samples.some(s=>s.stage==='equation'));
    assert.ok(samples.filter(s=>s.stage!=='total').every(s=>s.gameTotal===receipt.before),'pill moved before the equation cleared');
    const bases=samples.map(s=>s.base).filter(b=>b!==null);
    assert.ok(bases.includes(receipt.base));assert.ok(bases.every((b,i)=>i===0||b>=bases[i-1]));
    const totals=samples.filter(s=>s.stage==='total').map(s=>s.gameTotal);
    if(receipt.award>1)assert.ok(totals.some(n=>n>receipt.before&&n<receipt.cumulative),'missing game-total animation');
    assert.ok(totals.every((n,i)=>n>=receipt.before&&n<=receipt.cumulative&&(i===0||n>=totals[i-1])),'game total counted twice');
  }
  await page.getByText('Game Over',{exact:true}).waitFor({timeout:60000});
  await page.getByRole('tab',{name:'All Time'}).click();await page.locator('.leaderboard-achieved').waitFor();
  const saved=(await c.query("select score,final_state,completed_at from private.arcade_results where user_id=$1 and game='crib-lab'",[actor])).rows;
  assert.equal(saved.length,1);assert.equal(saved[0].final_state.results.length,3);
  assert.equal(await page.locator('.arcade-score-table tbody tr').first().locator('td').last().textContent(),Number(saved[0].score).toLocaleString('en-US'));
  played.push(...await page.evaluate(()=>window.audioEvents));assert.deepEqual(errors,[]);
  writeFileSync(out+'/audio.json',JSON.stringify(played,null,2));
  for(const id of [':deal:','palette:triInvalid:','palette:slide:',':in',':out',':cut','cribbageHighlight','crib-lab:count:','scorePost'])assert.ok(played.some(e=>e.includes(id)),id+' missing '+JSON.stringify(played));
  assert.equal(new Set(played).size,played.length);
  if(polish){
    for(const round of [1,2,3])for(const p of ['discard','stock','swap'])assert.ok(played.some(id=>id.endsWith(':'+round+':'+p+':transition')),'missing phase cue '+round+' '+p);
    for(const round of [1,3]){
      const count=receipts.get(round).presentation.beats.filter(b=>b.kind!=='subtotal').length;
      assert.equal(played.filter(id=>id.includes(':'+round+':combo:')).length,count,'combo cues');
    }
  }
  writeFileSync(out+'/result.json',JSON.stringify({polish,layouts,played,requests:log.length,rounds:saved[0].final_state.results.map(r=>({base:r.base,multiplier:r.multiplier,award:r.award,cumulative:r.cumulative,combinations:r.presentation?.beats.filter(b=>b.kind!=='subtotal').length,scoringMs:r.presentation?.endAt??10000}))},null,2));
  console.log('PASS: three rounds through leaderboard; six layouts, clock and centerline, suit styling, header confirmation, stock badge, phases and scoring/audio recovery.');

  }
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
