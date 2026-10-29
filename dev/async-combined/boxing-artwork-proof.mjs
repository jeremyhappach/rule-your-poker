import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15325',checks=[],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage(),errors=[],external=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.origin);return route.abort();}if(url.pathname==='/fixture-review-api')calls.push(route.request().postDataJSON());return route.continue();});
 assert.equal((await(await fetch(base+'/review-health')).json()).fixtureOnly,true);
 await page.goto(base+'/review-warmup',{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>document.body.dataset.reviewReady==='true',null,{timeout:120000});
 await page.evaluate(async()=>{await Promise.all(['boxing-draw-v1','boxing-winner-cash-v1'].map(async name=>{const img=new Image();img.src='/src/assets/async-finale/'+name+'.jpg';await img.decode();}));});console.log('PASS warm server, module graph and original artwork decoded');
 for(const width of [320,390,1440])for(const reduced of [false,true])for(const outcome of ['win','loss','draw']){
  await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});const prior=calls.length;
  await page.goto(base+'/delayed/'+outcome+'?finale=1',{waitUntil:'domcontentloaded'});await page.locator('.async-boxing img').waitFor();await page.locator('.async-boxing img').evaluate(img=>img.decode());
  const state=await page.evaluate(()=>{const scene=document.querySelector('.async-boxing-scene'),img=scene.querySelector('img'),bag=scene.querySelector('.async-cash-label'),r=scene.getBoundingClientRect(),names=[...scene.querySelectorAll('[data-player-id]')];return {asset:img.getAttribute('src'),decoded:img.complete&&img.naturalWidth>0,visible:getComputedStyle(document.querySelector('.async-boxing')).display!=='none',width:r.width,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth,bag:bag?.textContent??null,bagFits:!bag||bag.scrollWidth<=bag.clientWidth+1,names:names.map(n=>({id:n.getAttribute('data-player-id'),text:n.textContent,role:n.className,fits:n.scrollWidth<=n.clientWidth+1})),confetti:document.querySelectorAll('.async-confetti').length,transfers:document.querySelectorAll('.async-chip-transfer').length};});
  assert(state.decoded&&state.visible);assert(Math.abs(state.width-state.height)<2,'square artwork preserves full image and cash overlay alignment');assert(!state.overflow);assert(state.bagFits);assert(state.names.every(n=>n.fits));assert.equal(state.transfers,0);assert.equal(state.confetti,outcome==='win'&&!reduced?1:0);
  if(outcome==='draw'){assert.equal(state.bag,null);assert(state.asset.includes('boxing-draw-v1'));assert(state.names.every(n=>n.role==='boxer-neutral'));assert.deepEqual(state.names.map(n=>n.id),['me','other']);}
  else{assert.equal(state.bag,'$5');assert(state.asset.includes('boxing-winner-cash-v1'));assert.equal(state.names[0].id,outcome==='win'?'me':'other');assert.equal(state.names[0].role,'boxer-winner');assert.equal(state.names[1].role,'boxer-loser');}
  await page.screenshot({path:'qualification.local/async-combined/boxing-'+width+'-'+outcome+(reduced?'-reduced':'')+'.png'});
  await page.waitForURL('**/delayed/'+outcome+'?history=1');await page.getByRole('heading',{name:'Hap vs. Jeremy Happach'}).waitFor();
  assert.equal(calls.slice(prior).filter(c=>c.name==='delayed_finale_ack').length,1);assert(!calls.slice(prior).some(c=>c.op==='action'||['delayed_remove','delayed_respond'].includes(c.name)));
  checks.push({width,reduced,outcome,passed:true});console.log('PASS',width,reduced?'reduced':'normal',outcome);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);writeFileSync('qualification.local/async-combined/boxing-browser.json',JSON.stringify({passed:true,checks,errors,external},null,2));
}finally{await browser.close();}
