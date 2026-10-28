import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});const evidence=[];
await mkdir('../incident-smoke-visuals',{recursive:true});
try{for(const game of ['horses','ship-captain-crew']){
 const contexts=await Promise.all(['a','b'].map(()=>browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:3})));
 const pages=await Promise.all(contexts.map(c=>c.newPage()));const errors=[];
 for(const [i,page] of pages.entries()){
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:5180/e2e/incidents/smoke.html?game=${game}&viewer=${i?'b':'a'}`,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>!!window.__smoke,{timeout:120000});await page.waitForTimeout(700);console.log('mounted',game,i);
  await page.evaluate(()=>{window.__observations=[];const sample=()=>{const f=[...document.querySelectorAll('[data-chip-transport-intent]')];const nq=[...document.querySelectorAll('span')].some(e=>e.textContent.trim()==='NQ'&&e.getBoundingClientRect().width>0);window.__observations.push({at:Date.now(),flight:f.length,flightEnd:f.map(e=>Number(e.getAttribute('data-chip-transport-completes-at'))),roll:!!document.querySelector('[data-roll-in-flight="true"]'),nq,overlay:!!document.querySelector('[data-no-qualify-overlay]'),selection:!!document.querySelector('[data-smoke-selection]')});requestAnimationFrame(sample);};sample();});
 }
 // Roller receives final authority promptly, observer receives it after the
 // old age-based replay threshold. Batch can precede its final snapshot.
 await pages[1].evaluate(()=>{window.__smoke.complete();window.__smoke.transfer();});
 await pages[0].evaluate(()=>window.__smoke.transfer());
 await Promise.all(pages.map(page=>page.evaluate(()=>window.__smoke.peerAdvance())));
 await pages[0].waitForTimeout(2600);
 await expect(pages[0].locator('[data-smoke-selection]')).toHaveCount(0);
 await pages[0].evaluate(()=>window.__smoke.complete(3500));
 await expect(pages[0].locator('[data-roll-in-flight="true"]')).toBeVisible();
 await expect(pages[0].locator('[data-smoke-selection]')).toHaveCount(0);
 await pages[0].screenshot({path:`../incident-smoke-visuals/${game}-observer-third-roll.png`});
 await expect(pages[0].locator('[data-chip-transport-intent]').first()).toBeVisible({timeout:10000});
 await pages[0].evaluate(()=>window.__smoke.remount());
 await expect(pages[0].locator('[data-smoke-selection]')).toHaveCount(0);
 await expect(pages[0].locator('[data-roll-in-flight="true"]')).toHaveCount(0);
 for(const [i,page] of pages.entries()){
  await expect(page.locator('[data-smoke-selection]')).toBeVisible({timeout:15000});
  const observed=await page.evaluate(()=>({samples:window.__observations,events:window.__smoke.events}));
  const flights=observed.samples.filter(s=>s.flight);expect(flights.length).toBeGreaterThan(0);
  const nav=observed.events.find(e=>e.type==='navigate');expect(nav.at+1).toBeGreaterThanOrEqual(Math.max(...flights.flatMap(f=>f.flightEnd)));
  expect(observed.samples.some(s=>s.selection&&s.flight)).toBe(false);
  if(game==='ship-captain-crew'&&i===1){const overlay=observed.samples.filter(s=>s.overlay);expect(overlay.length).toBeGreaterThan(0);expect(flights[0].at).toBeGreaterThan(overlay.at(-1).at);const badges=observed.samples.filter(s=>s.nq);expect(badges.length).toBeGreaterThan(0);expect(badges[0].at).toBeGreaterThan(overlay.at(-1).at);}
  evidence.push({game,viewer:i?'roller':'observer',navigation:nav,firstFlight:flights[0].at,lastFlight:flights.at(-1).at,observedLiveRoll:observed.samples.some(s=>s.roll),peerAdvanceBeforeFlight:true,remountDuringFlight:i===0,overlayEnd:observed.samples.filter(s=>s.overlay).at(-1)?.at,firstNqBadge:observed.samples.find(s=>s.nq)?.at});
  await page.getByRole('button',{name:'Run It Back',exact:true}).click();
  await expect(page.locator('[data-smoke-selection]')).toHaveCount(0);
  await page.evaluate(()=>{window.__smoke.complete(10000);window.__smoke.transfer();});
  await expect(page.locator('[data-smoke-selection]')).toBeVisible({timeout:15000});
  expect(await page.evaluate(()=>window.__smoke.events.filter(e=>e.type==='navigate').map(e=>e.round))).toEqual([1,2]);
 }
 expect(errors).toEqual([]);await Promise.all(contexts.map(c=>c.close()));
}await writeFile('../incident-smoke-visuals/two-context.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();}
