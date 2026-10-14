// Browser layout/intent proof against production components with offline projections.
// All non-local requests are intercepted; never logs in or writes live game data.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qualification.local/fullscreen-run21';
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true},open:false});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[];
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568],[844,390]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:5178)/,route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.goto('http://127.0.0.1:5178/dev/run21/fullscreen.html');
    await page.locator('[data-fullscreen-game-shell]').waitFor();
    await page.getByRole('button',{name:/Place in column 1/}).waitFor();
    assert.equal(await page.locator('[data-canonical-felt-surface]').count(),0);
    assert.equal(await page.locator('[data-canonical-shell-pre-session-seat-region]').count(),0);
    const bounds=await page.locator('.run21-board').boundingBox();
    assert(bounds.width>width*.65&&bounds.height>height*.30,JSON.stringify({width,height,bounds}));
    for(const selector of ['.run21-column','.run21-currentCard','.run21-pass','.run21-help','.fullscreen-game-actions']){
      for(const box of await page.locator(selector).evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}))){
        assert(box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify({selector,width,height,box}));
      }
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
    await page.getByRole('button',{name:/Place in column 1/}).click();
    assert.equal(await page.locator('body').getAttribute('data-last-intent'),'place');
    await page.getByRole('button',{name:'Pass',exact:true}).click();
    assert.equal(await page.locator('body').getAttribute('data-last-intent'),'pass');
    await page.getByRole('button',{name:'Session',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    assert(await page.getByText('One Pass per round.').isVisible());
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.screenshot({path:`${out}/${width}x${height}.png`,animations:'disabled'});
    // Simulated safe-area padding: the available board must shrink without overflow.
    await page.locator('[data-canonical-shell-root]').evaluate(el=>el.style.padding='20px 16px 24px');
    const safe=await page.locator('.fullscreen-game-actions').boundingBox();
    assert(safe.y+safe.height<=height-23);
    assert.deepEqual(errors,[]);results.push({width,height,board:bounds,passed:true});
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5178)/,route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  for(const scene of ['maximum-depth','observer','reveal','ended']){
    await page.goto(`http://127.0.0.1:5178/dev/run21/fullscreen.html?scene=${scene}`);
    await page.locator('[data-fullscreen-game-shell]').waitFor();
    if(scene==='observer'||scene==='reveal')assert.equal(await page.locator('.run21-column:enabled').count(),0);
    if(scene==='ended')assert.equal(await page.locator('[data-run21-gameplay]').count(),0);
    if(scene==='maximum-depth'){
      await page.screenshot({path:`${out}/maximum-depth.png`,animations:'disabled'});
      const cards=await page.locator('.run21-stacked-card').count();assert.equal(cards,11);
    }
    results.push({scene,passed:true});
  }
  await page.goto('http://127.0.0.1:5178/dev/run21/fullscreen.html');
  await page.getByRole('button',{name:'Session',exact:true}).click();
  await page.getByRole('button',{name:'Test presentation transfer'}).click();
  await page.locator('body[data-transport-settled="true"]').waitFor();
  results.push({terminalTransport:'settled through existing shell runtime',passed:true});
  for(const game of ['3-5-7','cribbage','farkle','gin-rummy','holm','horses','ship-captain-crew','yahtzee']){
    await page.goto(`http://127.0.0.1:5178/dev/run21/fullscreen.html?game=${game}`);
    await page.locator('[data-canonical-felt-surface]').waitFor();
    assert.equal(await page.locator('[data-shell-presentation-mode="table"]').count(),1);
    assert.equal(await page.locator('[data-fullscreen-game-shell]').count(),0);
    results.push({game,originalTable:true,passed:true});
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
}finally{await browser.close();await server.close();}
