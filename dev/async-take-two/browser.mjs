import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {db,q,rpc,fixture,state,operation,people} from './service-fixture.mjs';
import {dir} from './local.mjs';
const errors=[],root=process.cwd(),transport=resolve(root,'dev/async-take-two/transport.ts');
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'take-two-isolated',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const path=req.url.split('?')[0];
 if(path.startsWith('/_take_two/')){
  try{const actor=req.headers['x-fixture-actor'];if(!people.includes(actor))throw Error('fixture:actor');
   let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
   const answer=path.endsWith('/action')?await operation(actor,body):await rpc(actor,body.name,body.args,'authenticated');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(answer));}
  catch(e){res.statusCode=409;res.end(JSON.stringify({error:e.message}));}return;
 }
 if(!path.startsWith('/delayed')&&!path.startsWith('/review'))return next();
 const html=await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-take-two/preview.tsx"></script></body></html>');
 res.setHeader('Content-Type','text/html');res.end(html);
});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:transport},{find:'@/lib/delayed/client',replacement:transport},{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port:15472,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
const pages=await Promise.all(people.map(()=>browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'})));
for(const p of pages)p.on('pageerror',e=>errors.push(e.message));
const checks=[];let activePage=pages[0];
try{
 const f=await fixture(false);
 for(let turn=0;turn<6;turn++){
  const actor=await q('SELECT actor v FROM private.delayed_children WHERE id=$1',[f.child]),page=pages[people.indexOf(actor)];
  activePage=page;await page.bringToFront();
  await page.goto('http://127.0.0.1:15472/delayed/'+f.match+'/play/'+f.child+'?actor='+actor);
  await page.locator('.take-bank:not([disabled])').waitFor({timeout:25000});
  let s=await state(actor,f.child);assert.equal(s.round,Math.floor(turn/2)+1);
  if(turn===0){
   while(!s.board.legalPairs.length){await page.locator('.take-stock').click();await page.waitForTimeout(150);s=await state(actor,f.child);}
   for(const i of s.board.legalPairs[0]){if(i===-1)await page.locator('.take-current').click();else{const p=s.board.layout[i];await page.getByRole('button',{name:new RegExp('^Row '+(p.row+1)+', card '+(p.column+1)+':')}).click();}}
   await page.waitForTimeout(200);s=await state(actor,f.child);assert.equal(s.board.samePairs+s.board.consecutivePairs,1);
   const score=s.board.score,stock=s.board.stockRemaining,drawResponse=page.waitForResponse(r=>r.url().endsWith('/_take_two/action')&&r.request().postDataJSON()?.intent?.type==='draw');
   await page.locator('.take-stock:not([disabled])').click();const draw=await drawResponse;assert.equal(draw.status(),200,await draw.text());
   s=await state(actor,f.child);assert.equal(s.board.score,Math.max(0,score-100));assert.equal(s.board.stockRemaining,stock-1);
   await page.reload();await page.locator('.take-bank:not([disabled])').waitFor();assert.equal((await state(actor,f.child)).board.score,s.board.score);
   for(const [width,height] of [[320,568],[390,844],[412,915],[844,390],[1440,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    for(const sel of ['.take-bank','.take-stock','.take-current','.take-tableau']){const box=await page.locator(sel).boundingBox();assert(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,sel+' '+width+'x'+height);}
    await page.screenshot({path:dir+'/layout-'+width+'x'+height+'.png'});
   }await page.setViewportSize({width:390,height:844});
  }
  await page.locator('.take-bank:not([disabled])').click();await page.getByRole('heading',{name:'Match home',exact:true}).waitFor({timeout:15000});
  checks.push('browser round '+(turn+1)+' actual service and SQL');
 }
 assert.equal(await q('SELECT terminal v FROM private.delayed_children WHERE id=$1',[f.child]),true);
 await pages[0].goto('http://127.0.0.1:15472/delayed/new?actor='+people[0]);
 await pages[0].getByRole('option',{name:'Take 2',exact:true}).waitFor({state:'attached'});
 checks.push('Take 2 available in actual capability-driven selector');
 assert.deepEqual(errors,[]);
 writeFileSync(dir+'/browser.json',JSON.stringify({passed:true,checks,errors,viewports:5,realTransport:true},null,2));console.log('PASS browser',checks);
}catch(e){await activePage.screenshot({path:dir+'/browser-failure.png'});writeFileSync(dir+'/browser-failure.json',JSON.stringify({error:e.message,errors,layout:await activePage.evaluate(()=>Array.from(document.querySelectorAll('.arcade-run,.fullscreen-game,.fullscreen-game-board,.take-plane,.take-fit,.take-cabinet,.take-felt,.take-play-group,.take-tableau-space,.take-cabinet footer,.take-current')).map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),style:{height:getComputedStyle(e).height,flex:getComputedStyle(e).flex,container:getComputedStyle(e).container}})))}));throw e;}
finally{await browser.close();await server.close();await db.end();}
