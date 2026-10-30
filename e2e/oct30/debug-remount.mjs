import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const receipt=[];
try {
 for(const allStay of [false]) {
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:393,height:852}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(const [i,p] of pages.entries()) { if(i!==2)continue; p.on("console",m=>console.log(m.text()));
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await p.goto(`http://127.0.0.1:${process.env.OCT30_BASELINE==='1'?5187:5186}/e2e/oct30/smoke.html?viewer=${i}`,{timeout:120000});
    await p.waitForFunction(()=>window.__oct30,{timeout:120000});
    await expect(p.locator('[data-holm-canonical-community-row]')).toBeVisible({timeout:15000});
    await p.evaluate(()=>{window.__samples=[];const sample=()=>{window.__samples.push({at:Date.now(),flights:[...document.querySelectorAll('[data-chip-transport-intent]')].map(e=>({id:e.getAttribute('data-chip-transport-intent'),end:Number(e.getAttribute('data-chip-transport-completes-at'))})),next:!!document.querySelector('[data-next-hand]')});requestAnimationFrame(sample)};sample();});
    await p.evaluate(all=>window.__oct30.settle(all),allStay);
    await p.waitForTimeout(350);
    if (i===0) await p.evaluate(()=>window.__oct30.defaults());
    if (i===1) {
      await p.evaluate(()=>window.__oct30.exposure(false));
      await p.waitForTimeout(100);
      await p.evaluate(()=>window.__oct30.exposure(true));
    }
    if (i===2) await p.evaluate(()=>window.__oct30.remount());
    await p.evaluate(()=>window.__oct30.duplicate());
    await p.waitForTimeout(10000); await writeFile('../oct30-remount-dom.html',await p.content()); await writeFile('../oct30-remount-state.json',JSON.stringify(await p.evaluate(()=>({events:window.__oct30.events,phase:window.__oct30.phase,samples:window.__samples})),null,2)); await expect(p.locator('[data-next-hand]')).toBeVisible({timeout:1000});
    const result=await p.evaluate(()=>({events:window.__oct30.events,samples:window.__samples}));
    await writeFile(`../oct30-holm-case-${allStay}-${i}.json`,JSON.stringify(result,null,2));
    const flights=result.samples.flatMap(s=>s.flights);
    expect(new Set(flights.map(f=>f.id))).toEqual(new Set(allStay?['award-flight','replacement-flight','replacement-self-flight']:['award-flight','replacement-flight']));
    expect(result.events.filter(e=>e.type==='next-hand')).toHaveLength(1);
    expect(result.events.find(e=>e.type==='next-hand').at+1).toBeGreaterThanOrEqual(Math.max(...flights.map(f=>f.end)));
    expect(errors).toEqual([]);
    receipt.push({allStay,viewer:i,events:result.events,flightIds:[...new Set(flights.map(f=>f.id))],errors});
    console.log('PASS Holm viewer',i,'allStay',allStay);
  }
  await Promise.all(contexts.map(c=>c.close()));
 }
  await writeFile('../oct30-browser-evidence.json',JSON.stringify(receipt,null,2));
} finally {await browser.close();}

