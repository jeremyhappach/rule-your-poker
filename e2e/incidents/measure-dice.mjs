import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const output=[];
await mkdir('../incident-visuals',{recursive:true});
for(const viewport of [{width:320,height:693},{width:393,height:852},{width:768,height:1024}]){
 const context=await browser.newContext({viewport,deviceScaleFactor:viewport.width===393?3:2});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const game of ['horses','ship-captain-crew'])for(const held of [0,2,5]){
  const page=await context.newPage();
  page.on('pageerror',e=>console.error(e.message));
  await page.goto(`http://127.0.0.1:5179/e2e/incidents/dice.html?game=${game}&held=${held}`);
  await page.locator('[data-die-idx]').first().waitFor();
  await page.waitForTimeout(500);
  const bounds=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
   const pot=rect(document.querySelector('[data-dice-pot-reserve]'));
   const dice=[...document.querySelectorAll('[data-die-idx]')].map(rect);
   const slot=rect(document.querySelector('[data-wave5-dice-slot]'));
   const felt=rect(document.querySelector('[data-canonical-felt-surface]'));
   return {cssWidth:innerWidth,cssHeight:innerHeight,dpr:devicePixelRatio,pot,dice,slot,felt,overlap:dice.some(d=>d.x<pot.right&&d.right>pot.x&&d.y<pot.bottom&&d.bottom>pot.y),minDieWidth:Math.min(...dice.map(d=>d.width))};
  });
  output.push({game,held,...bounds});
  if(process.env.INCIDENT_LABEL==='after'){
   assert.equal(bounds.overlap,false,`${game}/${held}: pot overlaps dice`);
   assert.equal(bounds.dice.length,5);
   assert.ok(bounds.minDieWidth>=bounds.felt.width*.14,`${game}: unreadable dice`);
   for(const die of bounds.dice)assert.ok(die.x>=bounds.slot.x-1&&die.right<=bounds.slot.right+1&&die.y>=bounds.slot.y-1&&die.bottom<=bounds.slot.bottom+1,`${game}/${held}: descendant exceeds assigned slot`);
  }
  await page.screenshot({path:`../incident-visuals/${process.env.INCIDENT_LABEL??'before'}-${viewport.width}-${game}-${held}.png`});
  await page.close();
 }
 await context.close();
}
await browser.close();
await writeFile(`../incident-visuals/${process.env.INCIDENT_LABEL??'before'}-bounds.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify(output.map(({game,held,cssWidth,dpr,overlap,minDieWidth})=>({game,held,cssWidth,dpr,overlap,minDieWidth})),null,2));
