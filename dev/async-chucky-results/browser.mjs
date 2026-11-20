import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from 'playwright';
import {expect} from '@playwright/test';

const output=resolve('qualification.local/async-chucky-results');
mkdirSync(output,{recursive:true});
const viewer='11111111-1111-4111-8111-111111111111',opponent='22222222-2222-4222-8222-222222222222';
const child='33333333-3333-4333-8333-333333333333',match='44444444-4444-4444-8444-444444444444';
const board=JSON.parse(readFileSync('dev/async-chucky-cards/projections.json','utf8')).fold_stay;
const entry='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-chucky-results/entry.tsx"></script></body></html>';
const server=await createServer({configFile:false,cacheDir:output+'/vite',plugins:[react(),{name:'chucky-results',configureServer(s){
 s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/review')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/review',entry));});
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-chucky-cards/client.ts')},{find:'@',replacement:resolve('src')}]},
 define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
 server:{host:'127.0.0.1',port:15494,strictPort:true,hmr:false,watch:null}});
const checks=[],errors=[];let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 for(const [width,height,terminal] of [[320,568,false],[390,844,false],[844,390,false],[1280,800,true]]){
  const context=await browser.newContext({viewport:{width,height}});
  await context.addInitScript(viewer=>sessionStorage.setItem('originals-user',viewer),viewer);
  await context.addInitScript(()=>{
   window.__roundScores=[];
   new MutationObserver(()=>{const score=document.querySelector('output[aria-label="Round score"]');
    if(score)window.__roundScores.push(Number(score.textContent.replaceAll(',','')));
   }).observe(document,{subtree:true,childList:true,characterData:true});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const event={id:'saved-round',kind:'attempt',actor:opponent,actorName:'Recorded opponent',round:2,score:2500,seen:false,
   receipt:{game:'chucky-showdown',rules:{ruleset:'chucky-showdown/3'}},
   board:{...structuredClone(board),phase:'round_over',cracks:1,uses:[2,1,0,2,1,0,2],score:99999}};
  const events=terminal?[event,{id:'child-result',kind:'child',receipt:{winner:opponent},seen:false}]:[event];
  const home={id:match,organizer:viewer,opponent,players:[{id:viewer,name:'Viewer'},{id:opponent,name:'Recorded opponent'}],realMoney:false,
   lineup:[{id:child,game:'chucky-showdown',terminal,stake:5,result:{winner:opponent},scores:{[viewer]:100}}],receipt:null};
  let prior=0;const calls=[];
  await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:15494'?route.continue():route.abort());
  await page.route('**/fixture/home',route=>route.fulfill({json:home}));
  await page.route('**/fixture/rpc',async route=>{
   const {name,args}=route.request().postDataJSON();calls.push({name,args});let data;
   if(name==='delayed_reviews')data={events,terminal,actor:viewer,started:false,serverAt:Date.now(),expiresAt:new Date(Date.now()+86400000).toISOString()};
   else if(name==='delayed_home')data=home;
   else if(name==='delayed_review_begin')data={elapsed:prior,seen:false};
   else if(name==='delayed_review_ack'){events.find(e=>e.id===args.p_event).seen=true;data=null;}
   else throw Error('Unexpected RPC '+name);
   await route.fulfill({json:{data,error:null}});
  });
  await page.goto('http://127.0.0.1:15494/review');
  await expect(page.getByRole('region',{name:'Opponent round results'})).toBeVisible();
  const score=page.getByLabel('Round score',{exact:true});
  await expect(score).toHaveText('2,500');
  const moving=await page.evaluate(()=>window.__roundScores.find(n=>n>0&&n<2500));assert.ok(moving,'Visible intermediate count');
  await expect(page.locator('.cs-card,.cs-table,[data-arcade-classic-face]')).toHaveCount(0);
  await expect(page.getByRole('img',{name:'1 of 3 lives remaining'})).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(7);
  await expect(page.locator('[data-exhausted=true]')).toHaveCount(2);
  await expect(page.locator('[data-available=true]')).toHaveCount(8);
  await page.screenshot({path:output+'/'+width+'-'+height+'.png'});
  for(const element of [score,page.getByRole('img',{name:'1 of 3 lives remaining'}),page.getByRole('list')]){
   await expect(element).toBeInViewport({ratio:1});
   assert.ok(await element.evaluate(e=>{const r=e.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!top&&(e.contains(top)||top.contains(e));}),'Results are unobscured');
  }
  assert.equal(calls.filter(c=>c.name==='delayed_review_ack').length,0);
  if(width===390){prior=50000;await page.reload();await expect(score).toHaveText('2,500');}
  await expect(page.getByText(terminal?'Game Complete':'Your gameplay',{exact:true})).toBeVisible({timeout:15000});
  assert.equal(calls.filter(c=>c.name==='delayed_review_ack'&&c.args.p_event==='saved-round').length,1);
  checks.push({width,height,terminal,reload:width===390,intermediate:moving,score:2500,calls});
  await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close();writeFileSync(output+'/report.json',JSON.stringify({checks,errors},null,2));}
console.log(JSON.stringify({passed:true,checks:checks.length,output}));
