import {chromium} from '@playwright/test';
import {writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:15327',out='qualification.local/async-combined',checks=[];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 const warm=await browser.newPage();await warm.goto(base+'/review-warmup',{waitUntil:'domcontentloaded'});await warm.waitForFunction(()=>document.body.dataset.reviewReady==='true',null,{timeout:120000});await warm.close();
 await fetch(base+'/fixture-review-api',{method:'POST',body:JSON.stringify({op:'fixture_reset'})});
 for(const game of process.argv.includes('--remaining')||process.argv.includes('--finale-only')?[]:['quintzee','run21','tri-towers','boxdrop']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')requests.push(r.postDataJSON());});
  await page.goto(base+'/delayed/turns/play/turn-'+game,{waitUntil:'domcontentloaded'});
  await page.getByText("Jeremy's round 2 results",{exact:true}).waitFor();assert.equal(requests.filter(r=>r.op==='action').length,0);
  await page.screenshot({path:`${out}/polish-${game}-intro.png`});
  await page.getByText('Your turn!',{exact:true}).waitFor({timeout:30000});assert.equal(requests.filter(r=>r.op==='action').length,0);
  const pills=game==='quintzee'?'.q-players .tri-score-cell':game==='run21'?'.async-score-pills .tri-score-cell':game==='tri-towers'?'.tri-score-group .tri-score-cell':'.box-scores .box-score';
  await page.waitForFunction(selector=>document.querySelectorAll(selector).length===2,pills,{timeout:10000});
  assert.equal(await page.locator(pills).count(),2);assert.equal(await page.locator('.delayed-page').count(),0);
  if(game==='quintzee'){
   assert.equal(requests.filter(r=>r.op==='action').length,0);assert.equal(await page.locator('.q-dice button').count(),0);
   await page.screenshot({path:`${out}/polish-quintzee-before-start.png`});await page.getByRole('button',{name:'Start',exact:true}).dblclick();
   await page.waitForFunction(()=>document.querySelectorAll('.q-dice [data-rolling=true]').length===5);
   assert.equal(requests.filter(r=>r.op==='action').length,1);assert.equal(await page.getByText(/saving/i).count(),0);
   await page.screenshot({path:`${out}/polish-quintzee-rumble.png`});
   await page.waitForFunction(()=>document.querySelectorAll('.q-dice [data-rolling=true]').length===0);
   const count=requests.filter(r=>r.op==='action').length;await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.q-dice button').length===5);
   assert.equal(requests.filter(r=>r.op==='action').length,count);assert.equal(await page.locator('.q-dice [data-rolling=true]').count(),0);assert.equal(await page.getByText("Jeremy's round 2 results",{exact:true}).count(),0);
  }
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/polish-${game}-play.png`});pass(game+' intro → review → handoff, private scores, two pills and mobile shell'+(game==='quintzee'?', explicit first roll, rumble, double-click and resumed reload':''));await page.close();
 }
 for(const width of process.argv.includes('--finale-only')?[]:[320,390]){
  const page=await browser.newPage({viewport:{width,height:844}});await page.goto(base+'/delayed/match');await page.locator('.async-pending').waitFor();
  assert.equal((await page.locator('.async-pending').first().textContent()).trim(),'Pending');assert.equal(await page.getByText(/viewed points shown/).count(),0);await page.screenshot({path:`${out}/polish-home-${width}.png`});await page.locator('.delayed-game-card').nth(1).screenshot({path:`${out}/polish-pending-${width}.png`});
  await page.goto(base+'/delayed');await page.getByText('Archived / Completed Sessions',{exact:true}).waitFor();assert.equal(await page.locator('.delayed-history-card').count(),0);
  await page.getByText('Archived / Completed Sessions',{exact:true}).click();await page.getByRole('heading',{name:'Completed Sessions'}).waitFor();await page.locator('.delayed-history-card').first().waitFor();
  assert.equal(await page.getByText('Hap vs Jeremy Happach',{exact:true}).count(),30);assert.equal(await page.getByRole('link',{name:'See Results',exact:true}).count(),30);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/polish-history-${width}.png`});pass(width+'px Pending placement, active/archive separation, paired names and persistent See Results');await page.close();
 }
 if(!process.argv.includes('--finale-only')){
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base+'/delayed/match?review=child1');await page.getByText('Game Complete',{exact:true}).waitFor();
  assert.equal(await page.getByText('Jeremy Happach banked the $5 stake',{exact:true}).count(),1);assert.equal(await page.getByText(/Saved final result|Included in the single match settlement/).count(),0);
  await page.screenshot({path:`${out}/polish-child-complete.png`});await page.waitForURL('**/delayed/match');assert.equal(await page.getByRole('link',{name:'View Results',exact:true}).count(),0);
  await page.reload();await page.locator('.delayed-game-card').first().waitFor();assert.equal(await page.getByRole('link',{name:'View Results',exact:true}).count(),0);
  const peer=await browser.newPage();await peer.goto(base+'/delayed/match');await peer.locator('.delayed-game-card').first().waitFor();assert.equal(await peer.getByRole('link',{name:'View Results',exact:true}).count(),0);await peer.close();
  pass('one child completion announcement; acknowledged W/L replaces CTA after reload and another fixture browser');await page.close();
 }
 for(const [id,reducedMotion] of [['win','no-preference'],['loss','no-preference'],['draw','reduce']]){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion});
  await page.addInitScript(()=>{
   document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement&&event.target.closest('.async-boxing'))window.__boxingImageAt=performance.now();},true);
   new MutationObserver(()=>{if(window.__boxingImageAt!==undefined&&window.__boxingFadeAt===undefined&&document.querySelector('.async-finale')?.getAttribute('data-phase')==='fade')window.__boxingFadeAt=performance.now();}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-phase']});
  });
  await page.goto(base+'/delayed/'+id+'?finale=1');await page.locator('.async-boxing img').waitFor();await page.waitForFunction(()=>document.querySelector('.async-boxing img')?.complete);
  await page.waitForTimeout(6800);assert.equal(await page.locator('.async-finale').getAttribute('data-phase'),'ring');await page.screenshot({path:`${out}/polish-finale-${id}.png`});
  await page.locator('.async-finale[data-phase=fade],.async-finale[data-phase=breakdown]').waitFor();const hold=await page.evaluate(()=>window.__boxingFadeAt-window.__boxingImageAt);assert(hold>=7000);assert.equal(await page.getByText(/authoritative|Balances have been settled/i).count(),0);
  await page.waitForURL('**history=1');assert.equal(await page.getByRole('link',{name:'View Results',exact:true}).count(),0);pass(id+' finale: measured '+hold+'ms full-image hold, fake-money copy, history and no viewed-child CTA');await page.close();
 }
 write(out+(process.argv.includes('--finale-only')?'/polish-browser-timing.json':process.argv.includes('--remaining')?'/polish-browser-remaining.json':'/polish-browser.json'),JSON.stringify({passed:true,checks,screenshotStatus:'Owner Library screenshots unavailable; local candidate screenshots generated'},null,2));
}finally{await browser.close();}
