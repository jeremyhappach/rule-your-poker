import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const output = '.codex/evidence/oct24-smoke';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
 const page = await browser.newPage();
 await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[667,375],[768,1024],[1280,800]]) {
  await page.setViewportSize({ width, height });
  await page.goto('http://127.0.0.1:4178/dev/oct24-smoke/');
  await page.locator('[data-scc-pot-position]').waitFor();
  await page.locator('[data-wave5-dice-slot]').waitFor();
  for (let turn = 0; turn < 2; turn++) {
   if (turn) await page.getByRole('button', { name: 'Next roll' }).click();
   const bounds = await page.evaluate(async () => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom }; };
    const read = selector => rect(document.querySelector(selector));
    const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.bottom && a.bottom > b.y;
    let legacyOverlap = false;
    for (let sample=0; sample<90; sample++) {
     await new Promise(requestAnimationFrame);
     const pot=read('[data-scc-pot-position]'), legacy=read('[data-legacy-pot]');
     for (const die of document.querySelectorAll('[data-die-idx]')) {
      if (getComputedStyle(die).opacity === '0') continue;
      const box=rect(die);
      if (overlaps(pot,box)) throw new Error(`Pot overlaps rendered die ${die.getAttribute('data-die-idx')}: ${JSON.stringify({pot,box})}`);
      if (overlaps(legacy,box)) legacyOverlap=true;
     }
    }
    return { pot: read('[data-scc-pot-position]'), dice: read('[data-wave5-dice-slot]'), legacy: read('[data-legacy-pot]'), legacyOverlap,
      renderedDice: document.querySelectorAll('[data-die-idx]').length };
   });
   if (bounds.pot.bottom >= bounds.dice.y || bounds.pot.y < 0) throw new Error(`SCC pot bounds failed ${width}x${height}: ${JSON.stringify(bounds)}`);
   results.push({ width,height,held:!!turn,...bounds });
  }
  if (width === 320 || width === 667) await page.screenshot({ path: `${output}/scc-${width}x${height}.png` });
 }
 if (errors.length) throw new Error(errors.join('\n'));
 writeFileSync(`${output}/geometry.json`, JSON.stringify(results,null,2));
 console.log(`PASS: ${results.length} SCC viewport/held-layout checks; no page errors. Synthetic fixture, not production smoke.`);
} finally { await browser.close(); }
