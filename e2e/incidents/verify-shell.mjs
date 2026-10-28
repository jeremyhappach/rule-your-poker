import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});const evidence=[];
try{for(const game of ['horses','ship-captain-crew'])for(const held of [0,2,5]){
 const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:3});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5180/e2e/incidents/shell.html?game=${game}&held=${held}`);
 await expect(page.locator('[data-wave5-dice-slot]').first()).toBeVisible();
 await page.waitForTimeout(600);
 const bounds=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};const slot=document.querySelector('[data-wave5-dice-slot]');const dice=[...slot.querySelectorAll('[data-die-idx]')].map(rect);const pot=rect(document.querySelector('[data-dice-pot-reserve]'));return {dice,pot,slot:rect(slot),overlap:dice.some(d=>d.x<pot.right&&d.right>pot.x&&d.y<pot.bottom&&d.bottom>pot.y),minDieWidth:Math.min(...dice.map(d=>d.width))};});
 expect(bounds.dice.length).toBe(5);expect(bounds.overlap).toBe(false);expect(bounds.minDieWidth).toBeGreaterThan(35);
 if(held===2){
  await page.screenshot({path:`../incident-visuals/full-shell-${game}.png`});
  await page.evaluate(()=>window.__shell.complete());
  await expect(page.locator('[data-roll-in-flight="true"]')).toBeVisible();
  await expect(page.getByText('Lance rolled NQ!',{exact:true})).toBeVisible({timeout:5000});
  await expect(page.locator('[data-roll-in-flight="true"]')).toHaveCount(0);
  await page.evaluate(()=>window.__shell.remount());await page.waitForTimeout(200);
  await expect(page.locator('[data-roll-in-flight="true"]')).toHaveCount(0);
  await page.evaluate(()=>window.__shell.rollover());await page.waitForTimeout(200);
  await expect(page.locator('[data-no-qualify-overlay]')).toHaveCount(0);
  await expect(page.locator('[data-roll-in-flight="true"]')).toHaveCount(0);
 }
 expect(errors).toEqual([]);evidence.push({game,held,...bounds,fullShell:true});await context.close();
 }
 // Active SCC player: actual overlay portal, completion, no replay on remount.
 const page=await browser.newPage({viewport:{width:393,height:852}});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:5180/e2e/incidents/shell.html?game=ship-captain-crew&viewer=b');await page.waitForTimeout(600);await page.evaluate(()=>window.__shell.complete());await expect(page.locator('[data-no-qualify-overlay]')).toBeVisible();await expect(page.locator('[data-no-qualify-overlay]')).toHaveCount(0,{timeout:5000});await page.evaluate(()=>window.__shell.remount());await page.waitForTimeout(200);await expect(page.locator('[data-no-qualify-overlay]')).toHaveCount(0);evidence.push({activeSccOverlay:true,remountReplay:false});
 await writeFile('../incident-visuals/full-shell.json',JSON.stringify(evidence,null,2));console.log(evidence.map(({game,held,overlap,minDieWidth,activeSccOverlay})=>({game,held,overlap,minDieWidth,activeSccOverlay})));
}finally{await browser.close();}
