import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const dir='dev/mega-card-golf/final-stock/evidence.local/';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
try{
 for(const allowance of [0,1]){
  await page.goto('http://127.0.0.1:5193/dev/mega-card-golf/final-stock/index.html?discards='+allowance);
  const button=page.getByRole('button',{name:'Stand Pat'});await button.waitFor();assert(await button.isEnabled());
  const rect=await button.boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=390&&rect.y+rect.height<=844);
  const before=JSON.parse(await page.getByTestId('authority').textContent());
  await page.screenshot({path:dir+'stand-pat-'+allowance+'.png'});await button.click();
  const after=JSON.parse(await page.getByTestId('authority').textContent());assert.deepEqual(after.cards,before.cards);assert.equal(after.discards,0);assert.equal(after.results.length,1);assert.equal(after.status,'completed');
  await page.getByText('Revealing your hand…').waitFor();
  await page.locator('[data-mega-transition="hole"]').waitFor({timeout:18000});
  await page.screenshot({path:dir+'stand-pat-result-'+allowance+'.png'});
 }
 await page.goto('http://127.0.0.1:5193/dev/mega-card-golf/final-stock/index.html?nonfinal=1');
 await page.getByRole('button',{name:'Discard'}).waitFor();assert.equal(await page.getByRole('button',{name:'Stand Pat'}).count(),0);assert(await page.getByRole('button',{name:'Discard'}).isDisabled());
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);writeFileSync(dir+'browser.json',JSON.stringify({passed:3,errors,external},null,2));console.log('PASS: 0/1 allowance mobile Stand Pat, board preservation, reveal/result order, non-final denial, no external requests');
}finally{await browser.close();}
