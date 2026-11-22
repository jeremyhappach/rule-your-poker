import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Presentation-only fixture: reuse the shared Words view and transport stub.
// The dictionary and scoring authority are unchanged and are not mocked as proof of rules.
const out='qualification.local/words-invalid-overlay';mkdirSync(out,{recursive:true});
const html='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/six-item-polish/preview.tsx"></script></body></html>';
const server=await createServer({configFile:false,cacheDir:out+'/vite',plugins:[react(),{name:'overlay-fixture',configureServer(s){
 s.middlewares.use('/__preview',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({points:58,invalidWords:['FUC','FE','CE'],words:[]}));});
 s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0].includes('.')||req.url?.startsWith('/@')||req.url?.startsWith('/node_modules'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/six-item-polish/client.ts')},{find:'@',replacement:resolve('src')}]},define:{__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"overlay-fixture"',__APP_BUILD_SHA__:'"overlay-fixture"',__BUILD_TIMESTAMP__:'"local"'},server:{host:'127.0.0.1',port:5199,strictPort:true,hmr:false}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const evidence=[],errors=[];
const center=async locator=>{const b=await locator.boundingBox();assert.ok(b);return {x:b.x+b.width/2,y:b.y+b.height/2};};
async function drag(cdp,from,to){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
 for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
try{
 for(const mode of ['multiplayer','async'])for(const [width,height] of [[390,844],[320,568],[430,932],[844,390],[1280,900]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/?mode='+mode+'&cross=1');
  await page.locator('[data-tile-id="0"]').tap();await page.locator('[data-square="112"]').tap();
  await page.locator('[data-tile-id="1"]').tap();await page.locator('[data-square="113"]').tap();
  const submit=page.getByRole('button',{name:'Submit Word (+58)',exact:true});await submit.waitFor();
  const placements=()=>page.locator('.is-staged').evaluateAll(es=>es.map(e=>({square:e.dataset.square,text:e.textContent})));
  const before=await placements(),viewport=page.locator('.words-viewport'),grid=page.locator('.words-grid');
  await submit.tap();const overlay=page.getByRole('alert');await overlay.waitFor();
  assert.equal(await overlay.locator('strong').textContent(),'FUC, FE, CE');
  assert.equal(await page.locator('.words-player [role="alert"]').count(),0);
  const geometry=await overlay.evaluate(e=>{const b=e.getBoundingClientRect(),parent=e.parentElement.getBoundingClientRect(),css=getComputedStyle(e);return {box:{x:b.x,y:b.y,width:b.width,height:b.height},parent:{x:parent.x,y:parent.y,width:parent.width,height:parent.height},position:css.position,background:css.backgroundColor,children:[...e.children].map(child=>{const r=child.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};})};});
  assert.equal(geometry.position,'absolute');assert.equal(geometry.background,'rgba(28, 17, 21, 0.72)');
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(geometry.box[key]-geometry.parent[key])<1);
  for(const child of geometry.children){assert.ok(child.top>=geometry.box.y&&child.bottom<=geometry.box.y+geometry.box.height);assert.ok(child.left>=geometry.box.x&&child.right<=geometry.box.x+geometry.box.width);}
  await page.screenshot({path:`${out}/${mode}-${width}x${height}.png`});
  await page.getByRole('button',{name:'OK',exact:true}).tap();assert.equal(await overlay.count(),0);assert.deepEqual(await placements(),before);assert.equal(await submit.isEnabled(),true);
  await page.evaluate(()=>window.polishRerender());assert.equal(await overlay.count(),0);
  await submit.tap();await overlay.waitFor();await overlay.waitFor({state:'detached',timeout:4500});assert.deepEqual(await placements(),before);
  // Normal native gestures remain available immediately after dismissal.
  const p=await center(viewport);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x-25,y:p.y,id:1},{x:p.x+25,y:p.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x-45,y:p.y,id:1},{x:p.x+45,y:p.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(Number(await viewport.getAttribute('data-zoom'))>1);
  const panFrom=await center(page.locator('[data-square="97"]'));
  const transform=await grid.getAttribute('style');await drag(cdp,panFrom,{x:panFrom.x+18,y:panFrom.y+18});assert.notEqual(await grid.getAttribute('style'),transform);
  await page.getByRole('button',{name:'Reset Zoom'}).tap();
  await drag(cdp,await center(page.locator('[data-square="113"]')),await center(page.locator('[data-square="114"]')));
  assert.equal(await page.locator('[data-square="114"].is-staged').count(),1);
  evidence.push({mode,width,height,geometry,manualDismiss:true,autoDismiss:true,repeat:true,tilesPreserved:true,previewPreserved:true,pinchPanDrag:true});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/browser.json',JSON.stringify({passed:true,evidence,errors},null,2));console.log(JSON.stringify({passed:true,layouts:evidence.length,errors}));
}catch(error){writeFileSync(out+'/failure.json',JSON.stringify({message:error.message,evidence,errors},null,2));throw error;}
finally{await browser.close();await server.close();}
