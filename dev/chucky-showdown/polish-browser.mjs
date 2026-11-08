import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';

const out='qualification.local/chucky-polish';mkdirSync(out,{recursive:true});
const port=15542,origin='http://127.0.0.1:'+port;
const server=await createServer({configFile:false,cacheDir:out+'/vite',plugins:[react(),{name:'chucky-polish-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(req.url==='/fixture/rpc'){res.setHeader('Content-Type','application/json');return res.end('null');}
 if(req.url!=='/')return next();
 res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script>sessionStorage.setItem('showdown-local-user','fixture')</script><script type="module" src="/dev/chucky-showdown/polish-entry.tsx"></script></body></html>`));
 });}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/chucky-showdown/browser-client.ts')},{find:'@/hooks/useAuthGuard',replacement:resolve('dev/chucky-showdown/browser-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});
let browser;const evidence=[];
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(origin);await page.locator('.cs-table').waitFor();await page.evaluate(()=>document.fonts.ready);
 const fixture=(patch={},elapsed=2000,competitive=false)=>page.evaluate(({patch,elapsed,competitive})=>window.setChuckyFixture(patch,elapsed,competitive),{patch,elapsed,competitive});
 const measure=()=>page.evaluate(()=>{
  const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const dots=[...document.querySelectorAll('.cs-clock i')].map(e=>e.getBoundingClientRect());
  const overflow=[...document.querySelectorAll('.cs-slot,.cs-header button,.cs-header h1,.cs-bank,.cs-decisions button,.cs-levels button,.cs-message strong,.cs-hand-label')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5;}).map(e=>e.className);
  return {player:box('.cs-player .cs-slot'),community:box('.cs-community .cs-slot'),choice:box('.cs-choice'),heading:box('.cs-message strong'),bank:box('.cs-bank'),dots:dots.length,dotRows:new Set(dots.map(r=>r.y.toFixed(1))).size,dotRight:dots.at(-1)?.right,overflow};
 });
 for(const [width,height] of [[320,568],[375,667],[390,844],[667,375]]){
  await page.setViewportSize({width,height});await fixture();await page.waitForTimeout(550);
  assert.equal(await page.locator('.cs-dealer .cs-slot').count(),0);
  assert.equal(await page.locator('.cs-dealer .cs-card[aria-label="Face-down card"]').count(),0);
  await page.locator('.cs-portrait img').evaluate(img=>img.decode());
  assert.match(await page.locator('.cs-portrait img').getAttribute('src'),/chucky-portrait-four-cards\.png$/);
  assert.equal(await page.locator('.cs-community .cs-card[aria-label="Face-down card"]').count(),2);
  assert.equal(await page.locator('.cs-cracks [data-active=true]').count(),3);assert.equal(await page.locator('.cs-pips i[data-available=true]').count(),9);
  assert.equal(await page.locator('.cs-clock').innerText(),'');assert.match(await page.locator('.cs-clock').getAttribute('aria-label'),/seconds remaining/);
  const fold=await measure();assert.equal(fold.dotRows,1);assert.equal(fold.dots,24);assert.deepEqual(fold.overflow,[]);assert.ok(fold.dotRight<=width);assert.ok(fold.player.y>=fold.choice.bottom-1);
  await page.screenshot({path:`${out}/${width}-fold.png`});
  await page.getByRole('button',{name:/^STAY/}).click();await page.locator('[data-phase=choose]').waitFor();await page.waitForTimeout(550);
  const choose=await measure();assert.equal(choose.dotRows,1);assert.deepEqual(choose.overflow,[]);assert.ok(Math.abs(fold.player.y-choose.player.y)<1);assert.ok(Math.abs(fold.community.y-choose.community.y)<1);
  assert.equal(await page.locator('.cs-dealer .cs-slot').count(),0);assert.equal(await page.locator('.cs-portrait img').count(),1);
  await page.screenshot({path:`${out}/${width}-choose.png`});
  await page.getByRole('button',{name:'Level 4, 800 points, 2 uses remaining',exact:true}).click();await page.locator('[data-phase=showdown]').waitFor();await page.waitForTimeout(550);
  const showdown=await measure();assert.equal(await page.locator('.cs-dealer .cs-slot').count(),4);assert.deepEqual(showdown.overflow,[]);assert.ok(Math.abs(fold.player.y-showdown.player.y)<1);
  await page.screenshot({path:`${out}/${width}-showdown.png`});evidence.push({width,height,fold,choose,showdown});
 }
 await page.setViewportSize({width:320,height:568});
 // Keep the table mounted while committed snapshots traverse the real presentation queue.
 for(const level of [1,4,7]){
  await fixture();
  await page.evaluate(()=>window.pushChuckyScene({phase:'choose',since:13270,community:[{rank:'K',suit:'♠'},{rank:'6',suit:'♥'},{rank:'2',suit:'♠'},{rank:'5',suit:'♣'}]},2000));
  for(const [elapsed,faces] of [[2000,2],[2220,3],[2820,4],[3270,4]]){
   await page.evaluate(t=>window.setChuckyTime(t),elapsed);
   assert.equal(await page.locator('.cs-dealer .cs-slot').count(),0);
   assert.equal(await page.locator('.cs-community .cs-card:not([aria-label="Face-down card"])').count(),faces);
  }
  await page.evaluate(level=>window.pushChuckyScene({phase:'showdown',since:14000,level,chucky:[]},4000),level);
  assert.equal(await page.locator('.cs-dealer .cs-slot').count(),0);
  for(let n=1;n<=level;n++){
   await page.evaluate(t=>window.setChuckyTime(t),4000+n*180);
   assert.equal(await page.locator('.cs-dealer .cs-slot').count(),n);
   assert.equal(await page.locator('.cs-dealer .cs-card[aria-label="Face-down card"]').count(),n);
  }
  const faces=Array.from({length:level},(_,i)=>({rank:['A','K','Q','J','10','9','8'][i],suit:'♣'}));
  await page.evaluate(({level,faces})=>window.pushChuckyScene({chucky:faces},4000+level*180+540),{level,faces});
  for(let n=1;n<=level;n++){
   await page.evaluate(t=>window.setChuckyTime(t),4000+level*180+540+(n-1)*720);
   assert.equal(await page.locator('.cs-dealer .cs-card:not([aria-label="Face-down card"])').count(),n);
   assert.equal(await page.locator('.cs-dealer .cs-slot').count(),level);
  }
  evidence.push({mountedTransition:true,level,communityFaces:4,chuckyFaces:level});
 }
 for(const level of [1,7]){
  await fixture({phase:'showdown',level},2000);await page.waitForTimeout(200);
  assert.equal(await page.locator('.cs-dealer .cs-slot').count(),level);
  await fixture({phase:'showdown',level,chucky:[{rank:'A',suit:'♣'}]},2000);await page.waitForTimeout(200);
  assert.equal(await page.locator('.cs-dealer .cs-card:not([aria-label="Face-down card"])').count(),1);
  assert.equal(await page.locator('.cs-dealer .cs-slot').count(),level);
 }
 // Test all three actual lost slots by seeking the real Web Animation to its first frame.
 for(const remaining of [2,1,0]){
  await fixture({phase:'crack',cracks:remaining,level:1,chucky:[{rank:'2',suit:'♣'}],community:[{rank:'2',suit:'♠'},{rank:'2',suit:'♥'},{rank:'2',suit:'♦'},{rank:'5',suit:'♣'}],best:[{rank:'2',suit:'♣'}],label:'Four of a kind',risk:0},2049);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.cs-cracks [data-active=true]').count(),remaining+1);
  await page.evaluate(()=>window.setChuckyTime(2050));
  await page.locator('.cs-lost-heart').waitFor();
  assert.deepEqual((await measure()).overflow,[]);
  const originCheck=await page.evaluate(remaining=>{
   const heart=document.querySelector('.cs-lost-heart'),animation=heart.getAnimations()[0];animation.pause();animation.currentTime=0;
   const a=heart.getBoundingClientRect(),b=document.querySelector(`[data-life-slot="${remaining}"] svg`).getBoundingClientRect();
   return {remaining,dx:a.x+a.width/2-b.x-b.width/2,dy:a.y+a.height/2-b.y-b.height/2,active:document.querySelectorAll('.cs-cracks [data-active=true]').length};
  },remaining);
  assert.ok(Math.abs(originCheck.dx)<1&&Math.abs(originCheck.dy)<1,JSON.stringify(originCheck));assert.equal(originCheck.active,remaining);evidence.push(originCheck);
  await page.screenshot({path:`${out}/life-${remaining}-origin.png`});
  await page.evaluate(()=>{document.querySelector('.cs-lost-heart').getAnimations()[0].currentTime=325;});await page.screenshot({path:`${out}/life-${remaining}-flight.png`});
 }
 await fixture({},2000,true);await page.waitForTimeout(200);const competitive=await measure();assert.deepEqual(competitive.overflow,[]);assert.equal(competitive.dotRows,1);evidence.push({competitive});
 assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({evidence,errors},null,2));console.log('PASS: three phases at four sizes, fixed hand/community, 24 dots on one row, state availability, three exact lost-heart origins, competitive layout; no browser errors.');
}finally{await browser?.close();await server.close();}
