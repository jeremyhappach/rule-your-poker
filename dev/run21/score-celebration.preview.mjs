// Isolated visual component proof; no login, gameplay, or database mutations.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true},open:false});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  for(const [score,width,height,motion] of [[104,390,844,'reduce'],[105,1280,800,'no-preference'],[105,390,844,'reduce']]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install();
    await page.goto(`http://127.0.0.1:5178/dev/run21/score-celebration.html?score=${score}`);
    await page.getByRole('heading',{name:score===105?'PERFECT 105!':'INCREDIBLE 104!'}).waitFor();
    await page.clock.runFor(700);
    assert.equal(await page.locator('vite-error-overlay').count(),0);
    assert.equal(await page.getByRole('status').evaluate(el=>getComputedStyle(el).zIndex),'9999');
    if(motion==='reduce')assert.equal(await page.getByRole('status').evaluate(el=>getComputedStyle(el).animationName),'none');
    const box=await page.getByRole('heading').boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height);
    await page.screenshot({path:`qualification.local/run21-${score}-${width}.png`,animations:'disabled'});
    await page.clock.runFor(4000);assert.equal(await page.locator('body').getAttribute('data-retired'),'true');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({score,width,height,motion,errors,passed:true}));await page.close();
  }
}finally{await browser.close();await server.close();}
