import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('dev/eleven-up-local/evidence');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[],external=[],evidence=[];
await context.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:5198/')){external.push(route.request().url());return route.abort();}return route.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:5198/dev/eleven-up-local/index.html';
try{
 for(const [width,height] of [[320,568],[390,844],[430,932]]){
  await page.setViewportSize({width,height});await page.goto(url);await page.locator('.eleven-ball').first().waitFor();
  const metrics=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   const scene=rect(document.querySelector('.eleven-scene')),pockets=16*.64;
   const balls=[...document.querySelectorAll('.eleven-ball')].map(el=>{
    const r=rect(el),cx=r.x+r.width/2,cy=r.y+r.height/2;
    const unobstructed=[[0,0],[-.3,0],[.3,0],[0,-.3],[0,.3]].every(([x,y])=>document.elementFromPoint(cx+x*r.width,cy+y*r.height)?.closest('button')===el);
    return {...r,unobstructed,enabled:!el.disabled,ringClearance:Math.min(r.x-scene.x-pockets,r.y-scene.y-pockets,scene.right-pockets-r.right,scene.bottom-pockets-r.bottom)-5};
   });
   const current=document.querySelector('.eleven-current'),cradleStyle=getComputedStyle(current,'::before'),cradleHome=rect(current);
   const cradle={x:cradleHome.x+parseFloat(cradleStyle.left),y:cradleHome.y+parseFloat(cradleStyle.top),right:cradleHome.right-parseFloat(cradleStyle.right),bottom:cradleHome.bottom-parseFloat(cradleStyle.bottom)};
   return {balls,scene,cradle,draw:rect(document.querySelector('.eleven-draw')),pass:rect(document.querySelector('.eleven-pass')),timer:rect(document.querySelector('.eleven-clock')),takeDisabled:document.querySelector('.eleven-take-score').disabled,score:document.querySelector('.eleven-score-pill strong').textContent,decorationCapturesInput:['::before','::after'].some(pseudo=>getComputedStyle(document.querySelector('.eleven-scene'),pseudo).pointerEvents!=='none'),overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
  });
  assert.equal(metrics.balls.length,22);assert.ok(metrics.balls.every(b=>b.unobstructed));assert.ok(metrics.balls.every(b=>b.ringClearance>0));
  assert.equal(metrics.balls.filter(b=>b.enabled).length,3,'only the three legally exposed full-rack balls are selectable');
  assert.equal(metrics.takeDisabled,true);assert.equal(metrics.score,'0');assert.equal(metrics.overflow,false);assert.equal(metrics.decorationCapturesInput,false);
  assert.ok(metrics.cradle.right<metrics.pass.x,'return cradle stays separate from Pass');assert.ok(metrics.cradle.y>metrics.timer.bottom,'return cradle stays below timer');
  assert.ok(metrics.cradle.bottom<metrics.scene.bottom-5,'cradle stays above rail');
  for(const b of metrics.balls)assert.ok(b.width>=32&&b.height>=32,'existing ball target dimensions retained');
  for(let i=0;i<metrics.balls.length;i++)for(let j=i+1;j<metrics.balls.length;j++){
   const a=metrics.balls[i],b=metrics.balls[j];assert.ok(Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2)>=a.width/2+b.width/2-.5,'ball targets do not overlap');
  }
  await page.screenshot({path:resolve(out,`full-rack-${width}.png`)});
  await page.getByRole('button',{name:'Take Score'}).evaluate(el=>el.click());assert.equal(await page.evaluate(()=>window.review.submissions.length),0,'disabled score never submits');
  await page.getByRole('button',{name:'Ball 1, exposed, position 9'}).tap();
  assert.equal(await page.getByRole('button',{name:'Ball 1, exposed, position 9'}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.eleven-ball').count(),22);await page.screenshot({path:resolve(out,`full-rack-selected-${width}.png`)});
  await page.getByRole('button',{name:'Ball 1, exposed, position 9'}).tap();
  assert.equal(await page.getByRole('button',{name:'Ball 1, exposed, position 9'}).getAttribute('aria-pressed'),'false');
  evidence.push({width,height,...metrics});
 }
 await page.setViewportSize({width:390,height:844});await page.goto(url);await page.getByRole('button',{name:/^Pass,/}).tap();
 await page.waitForFunction(()=>window.review.view.board.phase==='playing');assert.equal(await page.locator('.eleven-ball').count(),22);
 assert.equal(await page.getByRole('button',{name:'Take Score'}).isEnabled(),true);await page.getByRole('button',{name:'Draw ball 9'}).waitFor();
 await page.getByRole('button',{name:'Take Score'}).tap();await page.waitForFunction(()=>window.review.view.board.phase==='stage_complete');
 await page.waitForTimeout(1800);assert.equal(await page.locator('.eleven-ball').count(),22);assert.equal(await page.locator('.eleven-result').count(),0);
 assert.equal(await page.locator('.eleven-score-pill').getAttribute('data-centered'),'true');await page.screenshot({path:resolve(out,'full-rack-scoring-390.png')});
 await page.getByLabel('Score 6000',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.eleven-score-pill[data-centered=false]'));
 assert.equal(await page.locator('.eleven-ball').count(),22);await page.screenshot({path:resolve(out,'full-rack-returned-390.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(resolve(out,'full-rack.json'),JSON.stringify({evidence,errors,external,scoreFlow:true},null,2));
 console.log(JSON.stringify({pass:true,viewports:evidence.map(({width,height})=>`${width}x${height}`),minimumRingClearance:Math.min(...evidence.flatMap(e=>e.balls.map(b=>b.ringClearance))),ballDiameters:evidence.map(e=>({width:e.width,diameter:e.balls[0].width})),fullRackRetainedDuringScoring:true}));
}finally{await browser.close();}
