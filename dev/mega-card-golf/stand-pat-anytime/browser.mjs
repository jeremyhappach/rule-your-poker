import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const dir='dev/mega-card-golf/stand-pat-anytime/evidence.local/';
const base='http://127.0.0.1:5194/dev/mega-card-golf/stand-pat-anytime/index.html';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),errors=[],external=[],cases=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
try{
 for(const [name,width,height] of [['portrait',390,844],['landscape',844,390],['compact-portrait',320,568],['compact-landscape',568,320]]){
  await page.setViewportSize({width,height});
  for(const query of ['?stock=3&discards=0','?stock=1&discards=0','?stock=3&discards=1&noPending']){
   await page.goto(base+query);const button=page.getByRole('button',{name:'Stand Pat',exact:true});await button.waitFor();assert(await button.isEnabled());
   const rect=await button.boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);
   const before=JSON.parse(await page.getByTestId('authority').textContent());await button.click();
   assert.deepEqual(JSON.parse(await page.getByTestId('authority').textContent()),before);
   const dialog=page.getByRole('alertdialog');await dialog.waitFor();await page.waitForTimeout(250);const d=await dialog.boundingBox();assert(d.x>=0&&d.y>=0&&d.x+d.width<=width+1&&d.y+d.height<=height+1);
   await page.screenshot({path:dir+'confirm-'+name+'.png'});await page.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.deepEqual(JSON.parse(await page.getByTestId('authority').textContent()),before);
   await page.screenshot({path:dir+'play-'+name+'.png'});await button.click();await page.getByRole('button',{name:'Tap In?',exact:true}).click();
   const after=JSON.parse(await page.getByTestId('authority').textContent());assert.deepEqual(after.cards,before.cards);assert.equal(after.discards,before.discards);assert.equal(after.draws,before.draws);assert.equal(after.results.length,1);assert.equal(after.results[0].reason,'stand-pat');assert.equal(after.status,'completed');
   assert.equal(await page.getByRole('button',{name:'Stand Pat',exact:true}).count(),0);
   cases.push({name,query,cancelUnchanged:true,confirmUnchangedCards:true});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'?opening');await page.getByRole('button',{name:'Card 1 · concealed'}).waitFor();assert.equal(await page.getByRole('button',{name:'Stand Pat',exact:true}).count(),0);
 await page.goto(base);await page.getByRole('button',{name:'Stand Pat',exact:true}).click();await page.getByRole('button',{name:'Tap In?',exact:true}).click();
 await page.locator('[data-mega-transition="hole"]').waitFor({timeout:18000});await page.screenshot({path:dir+'hole-result.png'});
 await page.locator('[data-mega-transition="final"]').waitFor({timeout:18000});await page.screenshot({path:dir+'course-result.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);writeFileSync(dir+'browser.json',JSON.stringify({cases,openingPreserved:true,canonicalHoleAndFinalPresentation:true,errors,external},null,2));console.log('PASS: 12 phone cases, confirmation/cancel, preserved board, opening guard, hole/final presentation, no external requests');
}finally{await browser.close();}
