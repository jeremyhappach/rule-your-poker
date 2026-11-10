import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const dir='.polish-authority';mkdirSync(dir,{recursive:true});
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'polish-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/polish'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dev/production-polish/view.tsx"></script>'));});}}],resolve:{alias:[{find:'@/hooks/useAuthGuard',replacement:resolve('dev/async-combined/live-preview-auth.ts')},{find:'@/integrations/supabase/client',replacement:resolve('dev/async-combined/live-preview-transport.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15461,strictPort:true}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{for(const [width,height]of [[320,568],[375,667],[390,844],[430,932]])for(const mode of ['arcade','multiplayer','async']){
 const page=await browser.newPage({viewport:{width,height}});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:15461/polish?mode='+mode);await page.locator('.q-dice button').first().waitFor();
 const geometry=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {dice:[...document.querySelectorAll('.q-dice button')].map(box),categories:[...document.querySelectorAll('.q-category')].map(box),selectors:[...document.querySelectorAll('.q-selector')].map(box),plane:box(document.querySelector('.quintzee-plane')),bonus:box(document.querySelector('.q-bonuses')),play:box(document.querySelector('.q-play-area')),roll:box(document.querySelector('.q-roll')),labels:[...document.querySelectorAll('.q-category>span')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth,box:box(e)}))};});
 if(!process.argv.includes('--baseline')){
  const header=await page.evaluate(()=>{const bounds=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {players:bounds(document.querySelector('.q-players')),timing:bounds(document.querySelector('.q-timing')),scores:[...document.querySelectorAll('.q-players .tri-score-pill>strong')].map(e=>({score:bounds(e),pill:bounds(e.parentElement)}))};});
  assert(header.players.bottom<=header.timing.top+1,'score header does not overlap timing');
  for(const {score,pill} of header.scores)assert(score.top>=pill.top&&score.bottom<=pill.bottom,'total score fits its pill');
  assert.equal(geometry.categories.length,12);assert.equal(geometry.selectors.length,11);
  for(const box of geometry.selectors){assert(box.width>=48&&box.height>=48,'48px actual target');assert(box.y>=0&&box.y+box.height<=height,'selector in viewport');}
  for(let i=0;i<geometry.selectors.length;i++)for(let j=i+1;j<geometry.selectors.length;j++){const a=geometry.selectors[i],b=geometry.selectors[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'no overlapping targets');}
  assert(geometry.roll.y+geometry.roll.height<=height-2,'roll button inside viewport');
  for(const label of geometry.labels)assert(label.scroll<=label.width+1,'readable labels without clipping');
  await page.locator('[data-category=chance]>span').dispatchEvent('click');assert.equal(await page.evaluate(()=>window.intents.length),0,'labels inert');
  await page.locator('[data-category=chance] .q-selector').click();assert.deepEqual(await page.evaluate(()=>window.intents),[{type:'score',items:[11]}]);
 }
 await page.screenshot({path:`${dir}/${process.argv.includes('--baseline')?'baseline':'candidate'}-${mode}-${width}.png`});results.push({width,height,mode,...geometry});await page.close();
}
if(!process.argv.includes('--baseline'))for(const [width,height]of [[320,568],[375,667],[390,844],[430,932]]){
 const page=await browser.newPage({viewport:{width,height}});
 for(const [now,tone,remaining]of [[0,'success',250000],[225000,'warning',25000],[237500,'danger',12500],[250000,'danger',0]]){
  await page.goto(`http://127.0.0.1:15461/polish?game=run21&now=${now}`);await page.locator('.run21-timer').waitFor();
  const box=await page.locator('.run21-timer').boundingBox(),footer=await page.locator('.fullscreen-game-actions').boundingBox();
  assert(Math.abs(box.width-footer.width)<1&&Math.abs(box.x-footer.x)<1,'full available footer width');assert.equal(box.height,9);
  assert.equal(await page.locator('.run21-fullscreen-actions').innerText(),'');assert.equal(await page.locator('.run21-timer').getAttribute('data-run21-time-remaining'),String(remaining));assert.equal(await page.locator('.run21-timer-fill').getAttribute('data-run21-time-tone'),tone);
 }
 await page.goto('http://127.0.0.1:15461/polish?game=run21&now=200000&paused');await page.locator('.run21-timer').waitFor();assert.equal(await page.locator('.run21-timer').getAttribute('data-run21-time-remaining'),'125000');await page.close();
}
writeFileSync(`${dir}/${process.argv.includes('--baseline')?'baseline':'candidate'}-geometry.json`,JSON.stringify(results,null,2));console.log('PASS',results.length,'Quintzee viewport/mode checks and 20 Run21 geometry/timing checks');}finally{await browser.close();await server.close();}
