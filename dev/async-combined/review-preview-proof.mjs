import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15325',checks=[],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],external=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>console.log('FAILED REQUEST',r.url(),r.failure()?.errorText));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){external.push(u.origin);return route.abort();}if(u.pathname==='/fixture-review-api')requests.push(route.request().postDataJSON());return route.continue();});
 assert.equal((await (await fetch(base+'/review-health')).json()).fixtureOnly,true);
 await page.goto(base+'/');await page.getByRole('heading',{name:'Async local review'}).waitFor();checks.push('preview menu and local-only server healthy');
 await page.goto(base+'/review-warmup',{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>document.body.dataset.reviewReady==='true',null,{timeout:120000});checks.push('full browser module graph ready');console.log('PASS warm preview ready');
 await page.goto(base+'/delayed/match');await page.getByRole('heading',{name:'Hap vs. Jeremy Happach'}).waitFor();assert.equal(await page.getByText('Unsettled: $20',{exact:true}).count(),1);checks.push('actual preview match home rendered');
 await page.goto(base+'/delayed');await page.locator('.delayed-history-card').first().waitFor();await page.getByRole('button',{name:'Load older async matches'}).click();await page.waitForFunction(()=>document.querySelectorAll('.delayed-history-card').length===32);checks.push('actual preview history pages 30+2');
 for(const result of ['draw','win','loss']){
  const prior=requests.length;await page.goto(base+'/delayed/'+result+'?finale=1');await page.locator('.async-finale').waitFor();
  assert.equal(await page.locator('.async-confetti').count(),result==='win'?1:0);assert.equal(await page.locator('.async-chip-transfer').count(),result==='draw'?0:1);
  if(result==='draw'){assert.equal(await page.locator('.boxer-neutral').count(),2);assert.equal(await page.locator('.boxer-winner,.boxer-loser').count(),0);}
  await page.screenshot({path:'qualification.local/async-combined/preview-finale-'+result+'.png'});
  await page.waitForURL('**/delayed/'+result+'?history=1');await page.getByRole('heading',{name:'Hap vs. Jeremy Happach'}).waitFor();assert.equal(await page.getByRole('button',{name:'Delete play-money match',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Take Turn',exact:true}).count(),0);
  assert.equal(requests.slice(prior).filter(r=>r.name==='delayed_finale_ack').length,1);checks.push(result+' finale returns to read-only history with one fixture ACK');
 }
 await page.screenshot({path:'qualification.local/async-combined/preview-history-detail.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(!requests.some(r=>r.op==='action'||['delayed_respond','delayed_remove'].includes(r.name)));
 writeFileSync('qualification.local/async-combined/review-preview-proof.json',JSON.stringify({passed:true,url:base+'/',checks,external,errors},null,2));console.log('PASS',checks);
}finally{await browser.close();}
