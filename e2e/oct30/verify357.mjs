import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try {for(const kind of ['tax','ante']){for(const viewer of [0,1,2]){
 const context=await browser.newContext({viewport:{width:393,height:852}}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.goto(`http://127.0.0.1:${process.env.OCT30_BASELINE==='1'?5187:5186}/e2e/oct30/smoke.html?game=357&viewer=${viewer}`,{timeout:120000});await p.waitForFunction(()=>window.__357);
 await p.waitForTimeout(500);await p.evaluate(k=>window.__357[k](),kind);
 await expect(p.locator('[data-chip-transport-intent]').first()).toBeVisible({timeout:10000});
 await p.evaluate(()=>{window.__samples=[];const sample=()=>{window.__samples.push({at:Date.now(),chips:[...document.querySelectorAll('[data-chip-transport-intent]')].map(e=>Number(e.getAttribute('data-chip-transport-completes-at'))),cards:[...document.querySelectorAll('[data-card-transport-intent]')].map(e=>e.getAttribute('data-card-transport-card-id'))});requestAnimationFrame(sample)};sample();window.__357.peerAdvance();});
 await p.waitForTimeout(4500);
 const samples=await p.evaluate(()=>window.__samples);const flights=samples.filter(s=>s.chips.length);expect(flights.length).toBeGreaterThan(0);
 const nextCards=samples.filter(s=>s.cards.some(id=>id.includes('#r2#')));
 expect(nextCards.length).toBeGreaterThan(0);expect(nextCards[0].at+1).toBeGreaterThanOrEqual(Math.max(...flights.flatMap(s=>s.chips)));
 expect(errors).toEqual([]);results.push({kind,viewer,flightEnd:Math.max(...flights.flatMap(s=>s.chips)),firstSuccessorCard:nextCards[0].at,errors});
 await p.evaluate(()=>window.__357.secret());await expect(p.getByText('Hap wins (secret reveal)',{exact:true})).toBeVisible({timeout:10000});
 expect(await p.locator('body').innerText()).not.toContain('Hap won with a pair');
 console.log('PASS 357',kind,viewer);await context.close();
}}await writeFile('../oct30-357-browser-evidence.json',JSON.stringify(results,null,2));}finally{await browser.close();}
