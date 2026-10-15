import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qualification.local/tri-towers';await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true},open:false});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
try{
 for(const [width,height] of [[390,844],[844,390],[768,1024],[1024,768],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5179)/,r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:5179/dev/tri-towers/fullscreen.html');await page.locator('[data-tri-card="27"]').waitFor();
  assert.equal(await page.locator('[data-canonical-felt-surface]').count(),0);
  assert.equal(await page.locator('.tri-peak-label').count(),3);
  const boxes=await page.locator('[data-tri-card],.tri-stock,.tri-waste,.tri-actions').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const b of boxes)assert(b.x>=-1&&b.y>=-1&&b.x+b.w<=width+1&&b.y+b.h<=height+1,JSON.stringify({width,height,b}));
  for(const b of boxes.slice(18,28))assert(b.w>=28&&b.h>=42,JSON.stringify({width,height,b}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
  await page.screenshot({path:`${out}/${width}x${height}.png`,animations:'disabled'});
  await page.getByRole('button',{name:/Draw stock/}).click();assert.equal(await page.locator('body').getAttribute('data-last-intent'),'draw');
  const legal=page.locator('.tri-card:enabled').first();if(await legal.count()){await legal.click();assert.equal(await page.locator('body').getAttribute('data-last-intent'),'remove');}
  await page.getByRole('button',{name:'Session',exact:true}).click();await page.getByText('How to play').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('[data-canonical-shell-root]').evaluate(el=>el.style.padding='20px 16px 24px');
  const safe=await page.locator('.tri-actions').boundingBox();assert(safe.y+safe.height<=height-23);
  assert.deepEqual(errors,[]);results.push({width,height,cards:boxes.slice(18,28),passed:true});await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route(/^https?:\/\/(?!127\.0\.0\.1:5179)/,r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await page.goto('http://127.0.0.1:5179/dev/tri-towers/fullscreen.html?observer=1');await page.locator('[data-tri-card="27"]').waitFor();
 assert.equal(await page.locator('.tri-card:enabled,.tri-stock:enabled').count(),0);assert(await page.getByText('Jeremy · Watching live').isVisible());
 await writeFile(`${out}/layout-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await server.close();}
