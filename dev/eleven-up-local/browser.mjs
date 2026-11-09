import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const baselineCss=execFileSync('git',['show','97372c3b0:src/components/elevenUp/elevenUp.css'],{encoding:'utf8'});
const out=resolve('dev/eleven-up-local/evidence');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errors=[],external=[],evidence={layouts:[],audio:{},scoring:{}};
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith('http://127.0.0.1:5198/')){external.push(url);return route.abort();}return route.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:5198/dev/eleven-up-local/index.html';
const read=fn=>page.evaluate(fn);
const box=selector=>page.locator(selector).boundingBox();
try{
 await page.goto(url);await page.getByRole('button',{name:'Mute sounds'}).waitFor();
 for(const [width,height] of [[390,844],[320,568],[430,932],[844,390]]){
  await page.setViewportSize({width,height});
  const geometry=await read(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
   return {plane:rect('.eleven-plane'),balls:[...document.querySelectorAll('.eleven-ball')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}),draw:rect('.eleven-draw'),pass:rect('.eleven-pass'),take:rect('.eleven-take-score'),timer:rect('.eleven-clock'),scroll:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
  });
  assert.equal(geometry.scroll,false);const {plane,balls,draw,pass,take,timer}=geometry;
  for(const r of [...balls,draw,pass,take,timer])assert.ok(r.x>=plane.x-.5&&r.right<=plane.right+.5&&r.y>=plane.y-.5&&r.bottom<=plane.bottom+.5,`contained ${width}`);
  for(const r of [draw,pass,take])assert.ok(r.h>=44&&r.w>=44);
  assert.ok(timer.bottom<draw.y);assert.ok(draw.right<pass.x);
  evidence.layouts.push({width,height,...geometry});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'gameplay-iphone.png')});
 // The offline URL bypasses Arcade's game-entry gesture. Reproduce that unlock
 // before measuring gameplay cues; cold-context queuing is covered in the unit proof.
 await page.getByText('11 Up',{exact:true}).click();
 await page.waitForFunction(()=>window.review.platformAudio.context?.state==='running');
 const ball=page.getByRole('button',{name:'Ball 7, exposed, position 1'});
 await ball.click();await page.screenshot({path:resolve(out,'selected-iphone.png')});await ball.click();
 await ball.evaluate(el=>{for(let i=0;i<6;i++)el.click();});
 await page.waitForFunction(()=>window.review.cueEvents.filter(e=>/eleven-(select|deselect):/.test(e.id)).every(e=>e.played),{},{timeout:1500});
 const taps=await read(()=>window.review.cueEvents.filter(e=>/eleven-(select|deselect):/.test(e.id)));
 assert.equal(taps.length,8);assert.ok(taps.every(e=>e.played),JSON.stringify(taps));assert.equal(new Set(taps.map(e=>e.id)).size,8);
 evidence.audio.rapidTaps=taps;
 await page.getByRole('button',{name:'Mute sounds'}).click();await ball.click();await ball.click();
 const muted=await read(()=>window.review.cueEvents.slice(-2));assert.ok(muted.every(e=>!e.played));evidence.audio.muted=muted;
 await page.waitForTimeout(1050);await page.getByRole('button',{name:'Unmute sounds'}).click();
 await page.getByRole('button',{name:/^Pass,/}).click();await page.getByRole('button',{name:'Ball 9, exposed, position 2'}).waitFor();
 const landing=await read(()=>window.review.cueEvents.filter(e=>e.id.startsWith('eleven-land:')));assert.equal(landing.length,1);assert.equal(landing[0].played,true);
 await read(()=>{for(let i=0;i<5;i++)window.review.rerender();});await page.waitForTimeout(200);
 assert.equal(await read(()=>window.review.cueEvents.filter(e=>e.id.startsWith('eleven-land:')).length),1);evidence.audio.landing=landing;
 await page.screenshot({path:resolve(out,'landing-iphone.png')});
 const home=await box('.eleven-score-pill');
 await page.getByRole('button',{name:'Take Score'}).evaluate(el=>{el.click();el.click();el.click();});
 await page.waitForFunction(()=>window.review.view.board.phase==='stage_complete');
 assert.equal(await read(()=>window.review.submissions.filter(i=>i.type==='take_score').length),1);
 await page.waitForFunction(()=>document.querySelector('.eleven-score-pill[data-centered=true]'));
 await page.waitForTimeout(1300);const centered=await box('.eleven-score-pill'),plane=await box('.eleven-plane');
 assert.ok(Math.abs(centered.x+centered.width/2-plane.x-plane.width/2)<1);assert.ok(Math.abs(centered.y+centered.height/2-plane.y-plane.height/2)<1);
 const during=await page.locator('.eleven-score-pill strong').textContent();assert.ok(Number(during.replaceAll(',',''))>25200&&Number(during.replaceAll(',',''))<31200);
 assert.equal(await page.locator('.eleven-result').count(),0);await page.locator('.eleven-score-bonuses').getByText(/^Elevens/).waitFor();await page.locator('.eleven-score-bonuses').getByText(/^Speed/).waitFor();
 await page.screenshot({path:resolve(out,'scoring-iphone.png')});
 await page.getByLabel('Score 31200',{exact:true}).waitFor();assert.equal(await page.locator('.eleven-score-pill').getAttribute('data-centered'),'true');
 await page.screenshot({path:resolve(out,'settled-iphone.png')});await page.waitForTimeout(450);
 assert.equal(await page.locator('.eleven-score-pill').getAttribute('data-centered'),'true');
 await page.waitForFunction(()=>document.querySelector('.eleven-score-pill[data-centered=false]'));const returned=await box('.eleven-score-pill');
 assert.ok(Math.abs(returned.y-home.y)<1);assert.ok(Math.abs(returned.x-home.x)<1);
 await page.screenshot({path:resolve(out,'returned-iphone.png')});
 await page.waitForFunction(()=>window.review.view.round===2);await page.getByRole('button',{name:'Take Score'}).click();
 await page.getByText('Game complete',{exact:true}).waitFor({timeout:10000});await page.getByRole('button',{name:'Leaderboard'}).click();await page.getByText('Local leaderboard destination',{exact:true}).waitFor();
 evidence.scoring={home,centered,during,returned,submittedOnce:true,roundTwo:true,finalDestination:true};
 evidence.fullRackLayouts=[];
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]])for(const players of [1,2,7]){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:5198/dev/eleven-up/polish.html?players=${players}`);await page.locator('.eleven-ball').first().waitFor();
  const match=await page.evaluate(async css=>{
   const plane=document.querySelector('.eleven-plane').getBoundingClientRect(),balls=[...document.querySelectorAll('.eleven-ball')];
   const frame=document.createElement('iframe');Object.assign(frame.style,{position:'fixed',left:'-10000px',width:plane.width+'px',height:plane.height+'px',border:'0'});
   const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc='<style>html,body{margin:0;width:100%;height:100%;font-size:16px}*{box-sizing:border-box}button{padding:0;border:0}'+css+'</style><div class="eleven-plane"><div class="eleven-playfield"><div class="eleven-rack">'+balls.map(e=>'<button class="eleven-ball" style="'+e.getAttribute('style')+'"></button>').join('')+'</div></div></div>';document.body.append(frame);await loaded;
   const reference=[...frame.contentDocument.querySelectorAll('.eleven-ball')];
   const errors=balls.map((ball,i)=>{const a=ball.getBoundingClientRect(),b=reference[i].getBoundingClientRect();return Math.max(Math.abs(a.x-plane.x-b.x),Math.abs(a.y-plane.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height));});frame.remove();
   return {maxGeometryDelta:Math.max(...errors),balls:balls.length,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
  },baselineCss);
  assert.ok(match.maxGeometryDelta<.5,JSON.stringify({width,height,players,...match}));assert.equal(match.balls,22);assert.equal(match.overflow,false);
  evidence.fullRackLayouts.push({width,height,players,...match});
 }
 // Render real cues to PCM in the browser; record their separate signatures.
 evidence.audio.waveforms=await read(async()=>{
  const cues=await import('/src/lib/elevenUp/ballSounds.ts');const rows=[];
  for(const name of ['elevenSelectCue','elevenDeselectCue','elevenLandingCue']){
   const cue=cues[name],ctx=new OfflineAudioContext(1,Math.ceil(.2*44100),44100);cue.schedule(ctx,ctx.destination,n=>n);
   const data=(await ctx.startRendering()).getChannelData(0);rows.push({name,durationMs:cue.durationMs,peak:Math.max(...data.map(Math.abs)),energy:data.reduce((n,v)=>n+v*v,0),firstSamples:[...data.slice(1,10)]});
  }return rows;
 });
 assert.ok(evidence.audio.waveforms.every(r=>r.peak>0&&r.peak<1));assert.ok(evidence.audio.waveforms[2].energy>evidence.audio.waveforms[0].energy);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 evidence.errors=errors;evidence.externalRequests=external;await writeFile(resolve(out,'browser.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({pass:true,layouts:evidence.layouts.length,fullRackLayouts:evidence.fullRackLayouts.length,rapidCues:8,landingCues:1,score:'25200 → 31200 → header',network:'localhost only',out}));
}finally{await browser.close();}
