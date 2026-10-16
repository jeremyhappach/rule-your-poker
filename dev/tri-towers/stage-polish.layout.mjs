import {createServer} from 'vite';import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true},open:false});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),passed=[];
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1440,900]])for(const result of ['cleared','take_score']){
  const page=await browser.newPage({viewport:{width,height}});await page.route(/^https?:\/\/(?!127\.0\.0\.1:5179)/,r=>r.fulfill({status:200,body:'[]'}));
  await page.goto(`http://127.0.0.1:5179/dev/tri-towers/fullscreen.html?result=${result}`);await page.locator('[data-stage-result]').waitFor();
  const boxes=await page.locator('.tri-stage-result,.tri-stock-count,.tri-waste,.tri-actions').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const b of boxes)assert(b.x>=-1&&b.y>=-1&&b.x+b.w<=width+1&&b.y+b.h<=height+1,JSON.stringify({width,height,result,b}));
  const board=await page.locator('.tri-tableau-space').boundingBox(),panel=boxes[0];assert(panel.y>=board.y-1&&panel.y+panel.h<=board.y+board.height+1,JSON.stringify({width,height,result,board,panel}));
  const stock=boxes[1],waste=boxes[2];assert(stock.x+stock.w<=waste.x+1);
  await page.screenshot({path:`qualification.local/tri-towers/polish-${width}x${height}-${result}.png`});
  await page.emulateMedia({reducedMotion:'reduce'});assert(await page.locator('.tri-count .tri-count-reduced').isVisible());assert(!(await page.locator('.tri-count .tri-count-animated').isVisible()));
  if(result==='cleared')assert.equal(await page.locator('.tri-clear-towers').evaluate(el=>getComputedStyle(el).animationName),'none');
  passed.push({width,height,result,reducedMotion:true});await page.close();
 }
 const p=await browser.newPage({viewport:{width:390,height:844}});await p.route(/^https?:\/\/(?!127\.0\.0\.1:5179)/,r=>r.fulfill({status:200,body:'[]'}));
 for(const n of [23,10,1,0]){await p.goto(`http://127.0.0.1:5179/dev/tri-towers/fullscreen.html?stock=${n}`);await p.locator('.tri-stock-count').waitFor();assert.equal(await p.locator('.tri-stock-count').innerText(),String(n));assert(Number.parseFloat(await p.locator('.tri-stock-count').evaluate(el=>getComputedStyle(el).fontSize))>=24);}
 await p.setViewportSize({width:844,height:390});assert(await p.getByRole('button',{name:'Draw stock, 0 stock cards remaining'}).isDisabled());
 await writeFile('qualification.local/tri-towers/polish-layout.json',JSON.stringify({passed,stock:[23,10,1,0],rotation:true},null,2));console.log('PASS',passed.length,'result layouts, reduced motion, stock counts and rotation');
}finally{await browser.close();await server.close();}
