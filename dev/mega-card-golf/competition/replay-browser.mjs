import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync as write} from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[],page=await browser.newPage({viewport:{width:390,height:844}}),base='http://127.0.0.1:5198/dev/mega-card-golf/competition/index.html';
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
try{
 await page.goto(base+'?gate&holes=3');await page.getByRole('button',{name:'Skip Animation'}).waitFor();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('mega-proof-seen')),null);
 assert.equal(await page.getByText('Your playable hole is ready',{exact:true}).count(),0);
 await page.reload();await page.getByRole('button',{name:'Skip Animation'}).waitFor();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('mega-proof-seen')),null);
 assert.equal(await page.locator('.mega-tableau .mega-card[disabled]').count(),6);
 await page.getByRole('button',{name:'Skip Animation'}).click();await page.getByText('Your playable hole is ready',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.megaCompetition.actions.filter(a=>a.name==='delayed_review_ack').length),1);
 await page.reload();await page.getByText('Your playable hole is ready',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.megaCompetition.actions.filter(a=>a.name==='delayed_review_ack').length),0);
 checks.push('actual ReviewGate: refresh keeps replay unseen despite old elapsed lease; skip ACKs once; acknowledged reopening proceeds to turn');
 await page.setViewportSize({width:844,height:390});await page.goto(base+'?replay&holes=18');await page.locator('.mega-competition-summary').click();
 const bounds=await page.locator('.mega-competition-expanded').boundingBox();assert(bounds.y+bounds.height<=390);
 await page.locator('.mega-competition-expanded').evaluate(e=>e.scrollTop=e.scrollHeight);assert(await page.getByText('Back nine',{exact:true}).isVisible());
 await page.screenshot({path:'qualification.local/mega-competition/landscape-scorecard-scroll.png'});
 checks.push('expanded 18-hole landscape scorecard scrolls within the canonical shell');
 assert.deepEqual(errors,[]);write('qualification.local/mega-competition/replay-browser-proof.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
