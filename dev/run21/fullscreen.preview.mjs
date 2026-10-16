// Browser layout/intent proof against production components with offline projections.
// All non-local requests are intercepted; never logs in or writes live game data.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qualification.local/run21-polish-responsive';
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true,watch:{ignored:['**/qualification.local/**']}},open:false});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568],[844,390]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:5179)/,route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.goto('http://127.0.0.1:5179/dev/run21/fullscreen.html');
    await page.locator('[data-fullscreen-game-shell]').waitFor();
    await page.getByRole('button',{name:/Place in column 1/}).waitFor();
    assert.equal(await page.locator('[data-canonical-felt-surface]').count(),0);
    assert.equal(await page.locator('[data-canonical-shell-pre-session-seat-region]').count(),0);
    const bounds=await page.locator('.run21-board').boundingBox();
    assert(bounds.width>width*.65&&bounds.height>height*.30,JSON.stringify({width,height,bounds}));
    const card=await page.locator('.run21-currentCard').boundingBox(),pass=await page.locator('.run21-pass').boundingBox(),help=await page.locator('.run21-help').boundingBox();
    assert(card.y+card.height<=bounds.y+1);
    assert(Math.abs(card.x+card.width/2-(bounds.x+bounds.width/2))<2);
    assert(pass.x+pass.width<=card.x+2&&help.x>=card.x+card.width-2);
    const end=await page.locator('.run21-collect-button').boundingBox();
    const footer=await page.locator('.run21-fullscreen-actions').boundingBox();
    assert(Math.abs(end.x+end.width-(footer.x+footer.width))<2);
    const speed=await page.locator('.run21-speed').boundingBox();
    assert(speed.width>footer.width*.55);
    assert(await page.getByText('Round 1 · $1',{exact:true}).isVisible());
    const total=await page.locator('.run21-running-total').boundingBox(),helpButton=await page.locator('.run21-help button').boundingBox();
    assert(total.x+total.width<=helpButton.x,JSON.stringify({width,total,helpButton}));
    assert(parseFloat(await page.locator('.run21-running-total strong').evaluate(el=>getComputedStyle(el).fontSize))>=18);
    assert.equal(await page.locator('[data-run21-turn-state]').getAttribute('data-run21-turn-state'),'active');
    assert.equal(await page.locator('.run21-running-total').getAttribute('data-qualified'),'false');
    await page.screenshot({path:`${out}/active-${width}x${height}.png`,animations:'disabled'});
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
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5179)/,route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  for(const scene of ['maximum-depth','observer','inactive','qualified','success','bust','no-qualify','reveal','ended']){
    await page.goto(`http://127.0.0.1:5179/dev/run21/fullscreen.html?scene=${scene}`);
    await page.locator('[data-fullscreen-game-shell]').waitFor();
    if(scene==='observer'||scene==='inactive'||scene==='reveal')assert.equal(await page.locator('.run21-column:enabled').count(),0);
    if(scene==='observer'||scene==='inactive'){
      const timer=await page.locator('.run21-speed').boundingBox(),footer=await page.locator('.run21-fullscreen-actions').boundingBox();
      assert.equal(await page.locator('.run21-collect-button').count(),0);
      assert(Math.abs(timer.width-footer.width)<2);
      assert.equal(await page.locator('[data-run21-turn-state]').getAttribute('data-run21-turn-state'),'watching');
      assert.equal(await page.locator('.run21-live-card').evaluate(el=>getComputedStyle(el).filter),'grayscale(1)');
    }
    if(scene==='qualified')assert.equal(await page.locator('.run21-running-total').getAttribute('data-qualified'),'true');
    if(scene==='bust'||scene==='no-qualify'){
      assert((await page.locator('[data-run21-scoring]').innerText()).includes(scene==='bust'?'Busted!':'No Qualify!'));
      assert(!(await page.locator('[data-run21-scoring]').innerText()).includes('×'));
    }
    if(scene==='success')assert((await page.locator('[data-run21-scoring]').innerText()).includes('×'));
    if(['inactive','qualified','bust','no-qualify'].includes(scene))await page.screenshot({path:`${out}/${scene}.png`,animations:'disabled'});
    if(scene==='ended')assert.equal(await page.locator('[data-run21-gameplay]').count(),0);
    if(scene==='maximum-depth'){
      await page.screenshot({path:`${out}/maximum-depth.png`,animations:'disabled'});
      const cards=await page.locator('.run21-stacked-card').count();assert.equal(cards,11);
    }
    results.push({scene,passed:true});
  }
  for(const [width,height] of [[390,844],[844,390],[1440,900]]){
    await page.setViewportSize({width,height});
    for(const scene of ['intro-local','intro-opponent']){
      await page.goto(`http://127.0.0.1:5179/dev/run21/fullscreen.html?scene=${scene}`);
      const intro=page.locator('[data-run21-round-intro]');await intro.waitFor();
      assert((await intro.innerText()).includes(scene==='intro-local'?'YOUR TURN':'YOU IS UP'));
      assert.equal(await page.locator('.run21-column:enabled').count(),0);
      await page.screenshot({path:`${out}/${scene}-${width}x${height}.png`});
      await intro.waitFor({state:'hidden',timeout:5000});
      assert((await page.locator('.run21-timer-caption').innerText()).includes('30s'));
      if(scene==='intro-local')assert.equal(await page.locator('.run21-column:enabled').count(),5);
      results.push({scene,width,height,release:true});
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5179/dev/run21/fullscreen.html?scene=intro-local');
  assert.equal(await page.locator('.run21-boxing-bell').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.locator('[data-run21-round-intro]').waitFor({state:'hidden'});
  await page.goto('http://127.0.0.1:5179/dev/run21/fullscreen.html');
  // Resize the same live surface across the former aspect-ratio breakpoint.
  for(const [width,height] of [[1200,600],[600,900],[900,600],[390,844]]){
    await page.setViewportSize({width,height});
    await page.locator('.run21-currentCard').waitFor();
    const card=await page.locator('.run21-currentCard').boundingBox(),board=await page.locator('.run21-board').boundingBox();
    assert(card.y+card.height<=board.y+1);assert(Math.abs(card.x+card.width/2-(board.x+board.width/2))<2);
  }
  await page.getByRole('button',{name:'Session',exact:true}).click();
  await page.getByRole('button',{name:'Test presentation transfer'}).click();
  await page.locator('body[data-transport-settled="true"]').waitFor();
  results.push({terminalTransport:'settled through existing shell runtime',passed:true});
  for(const game of ['3-5-7','cribbage','farkle','gin-rummy','holm','horses','ship-captain-crew','yahtzee']){
    await page.goto(`http://127.0.0.1:5179/dev/run21/fullscreen.html?game=${game}`);
    await page.locator('[data-canonical-felt-surface]').waitFor();
    assert.equal(await page.locator('[data-shell-presentation-mode="table"]').count(),1);
    assert.equal(await page.locator('[data-fullscreen-game-shell]').count(),0);
    results.push({game,originalTable:true,passed:true});
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
}finally{await browser.close();await server.close();}
