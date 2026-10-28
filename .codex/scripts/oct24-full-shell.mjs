import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
const fullSeats=process.argv.includes('--full-seats');
try {
 const page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 for(const [width,height] of (fullSeats?[[390,844],[667,375]]:[[320,568],[375,667],[390,844],[430,932],[667,375],[768,1024],[1280,800]])) {
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:4178/dev/oct24-smoke/full.html'+(fullSeats?'?fullSeats':''));
  await page.locator('[data-scc-pot-position]').waitFor({timeout:15000});
  for(let held=0;held<6;held++){
   if(held)await page.locator('[data-test-next-roll]').click();
   const bounds=await page.evaluate(async()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
    const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.bottom&&a.bottom>b.y;
    let last,dieCount=0;
    for(let sample=0;sample<90;sample++){
     await new Promise(requestAnimationFrame);
     const pot=rect(document.querySelector('[data-scc-pot-position]'));
     const dice=[...document.querySelectorAll('[data-wave5-dice-slot] [data-die-idx]')].filter(e=>getComputedStyle(e).opacity!=='0');
     dieCount=Math.max(dieCount,dice.length);
     const obstacles=[...dice,...document.querySelectorAll('[data-hud-row="announcement"],[data-chip-center],[data-canonical-shell-header],[data-canonical-felt-plate-title]')];
     for(const e of obstacles)if(overlap(pot,rect(e)))throw new Error('Pot overlaps '+e.outerHTML.slice(0,150)+' '+JSON.stringify({pot,obstacle:rect(e)}));
     const frame=rect(document.querySelector('[data-canonical-felt-coord-frame]'));
     if(pot.y<frame.y||pot.bottom>frame.bottom)throw new Error('Pot crosses felt clipping boundary');
     last={pot,dice:dice.map(rect)};
    }
    if(!dieCount)throw new Error('No opponent dice rendered');
    return {...last,dieCount};
   });
   results.push({width,height,held,...bounds});
  }
  if(width===320||width===667)await page.screenshot({path:'.codex/evidence/oct24-smoke/'+(fullSeats?'six-seats-':'full-')+width+'x'+height+'.png'});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 writeFileSync('.codex/evidence/oct24-smoke/'+(fullSeats?'six-seats':'full-shell')+'.json',JSON.stringify(results,null,2));
 console.log('PASS: '+results.length+' actual MobileGameTable shell geometry checks; external requests blocked.');
}finally{await browser.close();}
