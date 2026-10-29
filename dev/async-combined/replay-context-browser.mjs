import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync as write} from 'node:fs';
const base='http://127.0.0.1:15327',out='qualification.local/async-combined',checks=[];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const warm=await browser.newPage();await warm.goto(base+'/review-warmup');await warm.waitForFunction(()=>document.body.dataset.reviewReady==='true');await warm.close();
 for(const width of [390,320])for(const game of ['quintzee','run21','tri-towers','boxdrop']){
  await fetch(base+'/fixture-review-api',{method:'POST',body:JSON.stringify({op:'fixture_reset'})});
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cells=game==='quintzee'?'.q-players .tri-score-cell':game==='run21'?'.async-score-pills .tri-score-cell':game==='tri-towers'?'.tri-score-group .tri-score-cell':'.box-scores .box-score';
  await page.goto(base+'/delayed/turns/play/turn-'+game);await page.locator('.async-result-review').waitFor();
  const get=()=>page.locator(cells);
  assert.equal(await get().count(),2);assert.equal(await get().nth(0).getAttribute('data-active'),'true');assert.equal(await get().nth(1).getAttribute('data-active'),'false');
  assert.match(await get().nth(0).textContent(),/80,000/);
  assert.equal(await get().nth(1).evaluate(e=>getComputedStyle(e).opacity),'0.6');
  await page.screenshot({path:`${out}/replay-${game}-${width}.png`});
  if(width===320){await page.reload();await page.locator('.async-result-review').waitFor();assert.equal(await get().count(),2);assert.match(await get().nth(0).textContent(),/80,000/);}
  await page.getByText('Your turn!',{exact:true}).waitFor({timeout:20000});
  await page.waitForFunction(selector=>!document.querySelector('.async-result-review')&&document.querySelectorAll(selector).length===2,cells);
  assert.match(await get().nth(1).textContent(),/39,848/);assert.match(await get().nth(0).textContent(),/80,000/);
  if(game==='quintzee')await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.screenshot({path:`${out}/own-${game}-${width}.png`});
  const button=game==='quintzee'?page.getByRole('button',{name:'Any: unfilled'}):game==='run21'?page.getByRole('button',{name:/Take Win|Give Up/}):page.getByRole('button',{name:'Take Score',exact:true});
  await button.click();
  await page.waitForFunction(selector=>{const all=document.querySelectorAll(selector);return all.length===2&&all[0].textContent.replaceAll(',','').match(/8[1-9][0-9]{3}|9[0-9]{4}|1[0-9]{5}/);},cells);
  assert.match(await get().nth(1).textContent(),/39,848/);assert.equal(await get().nth(0).getAttribute('data-active'),'true');
  await page.screenshot({path:`${out}/finish-${game}-${width}.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.delayed-match-home').waitFor({timeout:20000});
  assert.deepEqual(errors,[]);checks.push(`${width}px ${game}: saved replay${width===320?' resumed':''}, viewer highlight/opponent dim, 19,803 + 20,045 → 39,848, own play and finish, no overflow`);console.log('PASS',checks.at(-1));await page.close();
 }
 const page=await browser.newPage({viewport:{width:320,height:844}});await page.goto(base+'/delayed/match');await page.locator('.async-pending').waitFor();assert.equal(await page.getByText('Result awaiting reveal',{exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'View Results',exact:true}).count(),1);await page.screenshot({path:`${out}/pending-compact-320.png`});
 checks.push('Compact Pending retains hidden score and unviewed View Results without redundant helper');console.log('PASS',checks.at(-1));
 write(out+'/replay-context-browser.json',JSON.stringify({checks},null,2));
}finally{await browser.close();}
