import {chromium} from '@playwright/test';import {existsSync,mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),evidence=[],errors=[];
const scenes=['ready','partial','raised','closed','short','broken','queue','queue-full','clear','round-end','bonus','multi-active','multi-observer','multi-pills','multi-round-end','rules'];
mkdirSync('qualification.local/boxdrop/layout',{recursive:true});
try{for(const [width,height,scale,safe] of [[320,568,1],[390,844,1],[430,932,1],[844,390,1],[390,664,1],[390,844,1.2],[390,844,1,true]])for(const scene of scenes){
 const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5193/dev/boxdrop/layout.html?scene=${scene}`);await page.locator('.box-factory').waitFor({state:'attached'});
 await page.evaluate(({scale,safe})=>{document.documentElement.style.fontSize=16*scale+'px';if(safe){const frame=document.querySelector('.arcade-run');frame.style.paddingTop='47px';frame.style.paddingBottom='34px';}}, {scale,safe});
 await page.waitForTimeout(scene==='rules'?650:250);
 const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {board:rect(document.querySelector('.box-factory')),scores:rect(document.querySelector('.box-scores')),scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],bank:rect(document.querySelector('.box-bank')),round:rect(document.querySelector('.box-round')),shafts:[...document.querySelectorAll('.box-shaft')].map(rect)};});
 if(scene!=='rules'){
  assert.ok(Math.abs(geometry.scores.x+geometry.scores.w/2-width/2)<2,`${scene}: score centered`);
  assert.ok(geometry.board.bottom<=height+1,`${scene}: board fits`);
  assert.ok(Math.abs(geometry.board.w/geometry.board.h-4/3)<.05,`${scene}: factory aspect preserved`);
  assert.ok(geometry.scroll[0]<=width&&geometry.scroll[1]<=height,`${scene}: no page scroll`);
  assert.ok(geometry.round.right<=geometry.scores.x+1&&geometry.scores.right<=geometry.bank.x+1,`${scene}: scoreboard no overlap`);
  assert.equal(geometry.shafts.length,4);
 }
 if(scale===1&&[320,430].includes(width)||width===844&&scene==='partial')await page.screenshot({path:`qualification.local/boxdrop/layout/${width}-${height}-${scene}.png`});
 evidence.push({width,height,scale,safe,scene,...geometry});await page.close();
}
assert.deepEqual(errors,[]);writeFileSync('qualification.local/boxdrop/layout.json',JSON.stringify(evidence));console.log(`${evidence.length} scene/viewport geometry checks PASS`);
}finally{await browser.close();}
