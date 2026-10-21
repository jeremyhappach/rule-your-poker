import {chromium} from '@playwright/test';import {existsSync,mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),evidence=[],errors=[];
mkdirSync('qualification.local/race-poker/layout',{recursive:true});
try{for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[390,664]])for(const scene of ['opponent','autoplay','playing','pending','reconnect','paused','final','result','terminal','rules']){
 const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5226/dev/race-poker/layout.html?scene=${scene}`);await page.locator('.race-plane').waitFor({state:'attached'});await page.waitForTimeout(100);
 const g=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {plane:rect(document.querySelector('.race-plane')),track:rect(document.querySelector('.race-track')),scores:rect(document.querySelector('.race-scoreband')),horses:document.querySelectorAll('.race-horse').length,choices:[...document.querySelectorAll('.race-choices button')].map(rect),hand:[...document.querySelectorAll('.race-hand>div')].map(rect),scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};});
 if(scene!=='rules'){
 assert.equal(g.horses,2);assert.ok(g.plane.bottom<=height+1&&g.plane.right<=width+1,`${scene} ${width} plane fits`);assert.ok(g.scroll[0]<=width&&g.scroll[1]<=height,`${scene} ${width} no overflow`);assert.ok(g.track.h>(width>height?60:25),`${scene} ${width} track readable`);
 assert.ok(Math.abs(g.scores.x+g.scores.w/2-(g.plane.x+g.plane.w/2))<2,`${scene} ${width} scores centered on canonical plane`);
 if(scene!=='terminal'){assert.equal(g.choices.length,3);assert.equal(g.hand.length,5);for(const r of [...g.choices,...g.hand])assert.ok(r.h>=(width>height?44:30)&&r.bottom<=g.plane.bottom&&r.right<=g.plane.right,`${scene} ${width} cards visible`);}
 }
 if(scene==='opponent'){
  assert.equal(await page.locator('.race-choices').evaluate(e=>getComputedStyle(e).opacity),'0.42');
  assert.equal(await page.locator('.race-choices button:disabled').count(),3);
  assert.equal(await page.getByRole('img',{name:/is in Auto-play/}).count(),1);
 }
 if(scene==='autoplay'){
  const control=page.getByRole('checkbox',{name:'Auto-play'});assert.equal(await control.isChecked(),true);
  assert.equal(await page.locator('.race-choices button:disabled').count(),3);
  await control.uncheck();assert.equal(await control.isChecked(),false);
  assert.equal(await page.locator('.race-choices button:enabled').count(),3);
 }
 if(['opponent','autoplay','playing','result','terminal'].includes(scene)&&[320,430,844].includes(width))await page.screenshot({path:`qualification.local/race-poker/layout/${width}-${height}-${scene}.png`});evidence.push({width,height,scene,...g});await page.close();
}assert.deepEqual(errors,[]);writeFileSync('qualification.local/race-poker/layout.json',JSON.stringify(evidence));console.log(`${evidence.length} viewport/scene checks PASS`);
}finally{await browser.close();}
