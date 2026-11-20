import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from 'playwright';
import {expect} from '@playwright/test';

const fixtures=JSON.parse(readFileSync('dev/async-chucky-cards/projections.json','utf8'));
const diagnostic=process.argv.includes('--probe-stylesheet');
const output=resolve('qualification.local/async-chucky-cards',diagnostic?'stylesheet-probe':'regression');
mkdirSync(output,{recursive:true});
const actor='22222222-2222-4222-8222-222222222222';
const child='33333333-3333-4333-8333-333333333333';
const match='44444444-4444-4444-8444-444444444444';
const errors=[],checks=[],failures=[];
const entry='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-chucky-cards/entry.tsx"></script></body></html>';
const server=await createServer({
 configFile:false,cacheDir:output+'/vite',
 plugins:[react(),{name:'async-chucky-cards',configureServer(s){
  s.middlewares.use(async(req,res,next)=>{
   if(req.url?.split('?')[0]!=='/turn')return next();
   res.setHeader('Content-Type','text/html');
   res.end(await s.transformIndexHtml('/turn',entry));
  });
 }}],
 resolve:{alias:[
  {find:'@/integrations/supabase/client',replacement:resolve('dev/async-chucky-cards/client.ts')},
  {find:'@',replacement:resolve('src')},
 ]},
 define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
 server:{host:'127.0.0.1',port:15493,strictPort:true,hmr:false,watch:null},
});
let browser;
function boardAt(phase,since){
 return {...structuredClone(fixtures[phase]),since,due:since+(phase==='deal'?2450:30000),serverAt:Date.now()};
}
function snapshot(board,revision){
 return {id:child,matchId:match,game:'chucky-showdown',
  config:{game:'chucky-showdown',ruleset:'chucky-showdown/3',gameplay:fixtures.fold_stay.config,rounds:3,sharedDeck:false},
  revision,segment:1,actor,round:1,board,totals:{[actor]:0},pendingResults:{[actor]:0},reviewRevision:0,
  terminal:false,held:false,expiresAt:new Date(Date.now()+72*3600000).toISOString(),
  serverAt:Date.now(),holeResults:[],ownResults:[],winner:null,result:null};
}
async function measure(page){
 return page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  return {
   tableDisplay:getComputedStyle(document.querySelector('.cs-table')).display,
   timer:document.querySelector('[role=timer]')?.getAttribute('aria-label'),
   cards:[...document.querySelectorAll('.cs-community .cs-card,.cs-player .cs-card')].map(e=>{
    const face=e.querySelector('[data-arcade-classic-face]');
    return {label:e.getAttribute('aria-label'),slot:rect(e),face:face?rect(face):null};
   }),
  };
 });
}
async function visibleCards(page,phase){
 const groups=[{name:'My cards',cards:fixtures[phase].player},{name:'Community cards',cards:fixtures[phase].community}];
 for(const group of groups){
  const region=page.getByRole('region',{name:group.name,exact:true});
  await expect(region.locator('.cs-card')).toHaveCount(4);
  await expect(region.locator('[data-arcade-classic-face]')).toHaveCount(group.cards.length);
  for(let i=0;i<4;i++){
   const slot=region.locator('.cs-card').nth(i),card=group.cards[i];
   await expect(slot).toHaveAttribute('aria-label',card?card.rank+card.suit:'Face-down card');
   await expect(slot).toBeVisible({timeout:1000});
   await expect(slot).toBeInViewport({ratio:1,timeout:1000});
   const box=await slot.boundingBox();
   assert.ok(box&&box.width>=20&&box.height>=28,'Card must occupy a readable, nonzero rectangle');
   if(card){
    const face=slot.locator('[data-arcade-classic-face]');
    await expect(face).toHaveAttribute('data-arcade-classic-face',card.rank);
    await expect(face.locator('[data-arcade-classic-suit]')).toHaveAttribute('data-arcade-classic-suit',card.suit);
    await expect(face).toBeVisible({timeout:1000});
    const painted=await face.boundingBox();
    assert.ok(painted&&painted.width>=20&&painted.height>=28,'Actual face SVG must have visible dimensions');
    assert.ok(await face.evaluate(e=>{
     const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
     const top=document.elementFromPoint(x,y);
     if(!top||!(e.contains(top)||top.contains(e)))return false;
     for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)===0)return false;}
     return true;
    }),'Card face must be painted and unobscured');
   }
  }
 }
 await expect(page.getByRole('region',{name:'Chucky cards',exact:true}).locator('.cs-card')).toHaveCount(0);
}
try{
 await server.listen();
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
  for(const mode of ['fresh','fold_stay','choose']){
   const context=await browser.newContext({viewport});
   await context.addInitScript(actor=>sessionStorage.setItem('originals-user',actor),actor);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:15493'?route.continue():route.abort());
   let current=snapshot(mode==='fresh'?null:boardAt(mode,Date.now()-6000),1),actions=0,reads=0;
   await page.route('**/api/delayed',async route=>{
    const body=route.request().postDataJSON();
    assert.equal(body.childId,child);
    if(body.op==='action'){
     assert.equal(mode,'fresh');assert.equal(body.intent.type,'start');assert.equal(actions++,0);
     current={...current,board:boardAt('deal',Date.now()),revision:2};
    }else {assert.equal(body.op,'state');reads++;}
    await route.fulfill({json:{...current,serverAt:Date.now(),board:current.board?{...current.board,serverAt:Date.now()}:null}});
   });
   const phase=mode==='fresh'?'fold_stay':mode;
   const id=viewport.width+'-'+mode;
   await page.goto('http://127.0.0.1:15493/turn');
   if(mode==='fresh'){
    await page.getByRole('button',{name:'Begin round 1',exact:true}).click();
    await page.locator('.cs-table[data-phase=deal]').waitFor();
    // Simulated authoritative realtime update; the production timer and all
    // presentation/reconnect code run unchanged.
    await expect.poll(()=>Date.now()-current.board.since).toBeGreaterThanOrEqual(2450);
    current={...current,revision:3,board:boardAt('fold_stay',current.board.since+2450)};
    await page.evaluate(()=>window.dispatchEvent(new Event('async-chucky-revision')));
   }
   await page.locator('.cs-table[data-phase='+phase+']').waitFor();
   if(diagnostic)await page.addStyleTag({content:readFileSync('src/components/arcade/chuckyShowdown.css','utf8')});
   for(const stage of ['decision','reconnect']){
    if(stage==='reconnect'){
     const due=current.board.due,revision=current.revision,readBefore=reads;
     await context.setOffline(true);await context.setOffline(false);
     await page.reload();await page.locator('.cs-table[data-phase='+phase+']').waitFor();
     assert.ok(reads>readBefore,'Reconnect must fetch the already-running turn');
     assert.equal(current.board.due,due);assert.equal(current.revision,revision);
     assert.equal(actions,mode==='fresh'?1:0,'Reconnect must not restart the turn');
     if(diagnostic)await page.addStyleTag({content:readFileSync('src/components/arcade/chuckyShowdown.css','utf8')});
    }
    const before=await page.getByRole('timer').getAttribute('aria-label');
    await expect.poll(async()=>await page.getByRole('timer').getAttribute('aria-label'),{timeout:2500}).not.toBe(before);
    const evidence=await measure(page);
    const remaining=Number(evidence.timer?.match(/^\d+/)?.[0]);
    assert.ok(remaining>0&&Math.abs(remaining-Math.ceil((current.board.due-Date.now())/1000))<=1,
     'Rendered timer must seek the existing deadline, including after reconnect');
    await expect(page.getByRole('region',{name:'Scoring',exact:true}).locator('dd')).toHaveText(['0','0']);
    await page.screenshot({path:output+'/'+id+'-'+stage+'.png'});
    try{await visibleCards(page,phase);checks.push({id,stage,passed:true,...evidence});}
    catch(e){const failure={id,stage,passed:false,message:e.message,...evidence};checks.push(failure);failures.push(failure);}
   }
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
}finally{
 await browser?.close();await server.close();
 writeFileSync(output+'/report.json',JSON.stringify({diagnostic,checks,errors},null,2));
}
console.log(JSON.stringify({passed:failures.length===0&&errors.length===0,checks:checks.length,failures:failures.map(f=>({id:f.id,stage:f.stage})),errors,output},null,2));
assert.equal(failures.length,0,'Actual Async Chucky cards must be visible during decisions and reconnect; see report.json');
