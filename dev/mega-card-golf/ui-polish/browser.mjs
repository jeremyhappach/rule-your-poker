import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='dev/mega-card-golf/ui-polish/evidence.local/';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={runs:[],errors:[],external:[]};
try{
 for(const reduced of [false,true]){
  const label=reduced?'reduced':'normal',context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),requests=[];
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',async response=>{if(response.url().endsWith('/__mega'))requests.push({request:response.request().postDataJSON(),status:response.status(),data:await response.json()});});
  await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){report.external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:5199/dev/mega-card-golf/ui-polish/index.html');
  await page.getByRole('button',{name:'Select Sunny Meadows',exact:true}).click();
  const lobby=[];
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:720}]){
   await page.setViewportSize(viewport);
   const back=await page.getByRole('button',{name:'Return to Clubhouse',exact:true}).boundingBox(),tee=await page.getByRole('button',{name:'Tee Off',exact:true}).boundingBox();
   assert(back.x+back.width<=tee.x&&Math.abs(back.y-tee.y)<1,'back left / proceed right');
   assert.equal(await page.getByRole('button',{name:'Start Game',exact:true}).count(),0);
   lobby.push({viewport,back,tee});
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:dir+label+'-lobby.png'});
  await page.getByRole('button',{name:'Return to Clubhouse',exact:true}).click();
  await page.getByRole('button',{name:'Select Sunny Meadows',exact:true}).click();
  assert.equal(requests.filter(r=>r.request.op==='start').length,0);
  await page.getByRole('button',{name:'Tee Off',exact:true}).click();
  await page.getByRole('button',{name:'Card 1 · concealed',exact:true}).click();
  await page.getByRole('button',{name:'Card 6 · concealed',exact:true}).click();
  await page.waitForFunction(()=>!!document.querySelector('.mega-draw-area>.mega-start')&&!document.querySelector('.mega-draw-area>.mega-start').disabled);
  const incoming=await page.locator('.mega-draw-card>.mega-card').getAttribute('aria-label');
  const capture=async()=>page.evaluate(()=>{
   window.megaSamples=[];window.megaCapture=true;
   const tick=()=>{
    if(!window.megaCapture)return;
    const card=document.querySelector('.mega-tableau>[data-replacement-stage]');
    if(card){const face=card.querySelector('.mega-card-face'),inner=card.querySelector('.mega-card-inner');window.megaSamples.push({at:performance.now(),stage:card.dataset.replacementStage,outgoing:card.hasAttribute('data-outgoing-replacement'),label:card.getAttribute('aria-label'),opacity:Number(getComputedStyle(face).opacity),innerOpacity:Number(getComputedStyle(inner).opacity),rootOpacity:Number(getComputedStyle(card).opacity),transform:getComputedStyle(inner).transform,animations:face.getAnimations().map(a=>({name:a.animationName,duration:a.effect.getTiming().duration})),otherOpacities:[...document.querySelectorAll('.mega-tableau>.mega-card:not([data-replacement-stage]) .mega-card-face')].map(e=>Number(getComputedStyle(e).opacity))});}
    requestAnimationFrame(tick);
   };requestAnimationFrame(tick);
  });
  await capture();
  await page.getByRole('button',{name:'Card 2 · concealed',exact:true}).click();
  await page.locator('[data-outgoing-replacement][data-replacement-stage=reveal]').waitFor();
  await page.waitForFunction(()=>{const first=window.megaSamples[0];return first&&performance.now()-first.at>=400;});
  await page.screenshot({path:dir+label+'-outgoing.png'});
  await page.locator('[data-replacement-stage=arrive]').waitFor({timeout:5000});
  await page.waitForFunction(()=>!document.querySelector('[data-replacement-stage]')&&!!document.querySelector('.mega-draw-area>.mega-start')&&!document.querySelector('.mega-draw-area>.mega-start').disabled);
  const samples=await page.evaluate(()=>{window.megaCapture=false;return window.megaSamples;});
  const stages=['reveal','dissolve','arrive'].map(stage=>({stage,samples:samples.filter(s=>s.stage===stage)}));
  for(const group of stages)assert(group.samples.length>5,group.stage+' sampled');
  const reveal=stages[0].samples,dissolve=stages[1].samples,arrive=stages[2].samples;
  const durations={reveal:dissolve[0].at-reveal[0].at,dissolve:arrive[0].at-dissolve[0].at,arrivalObserved:arrive.at(-1).at-arrive[0].at};
  assert(Math.abs(durations.reveal-1500)<120,JSON.stringify(durations));assert(Math.abs(durations.dissolve-350)<100,JSON.stringify(durations));assert(durations.arrivalObserved>=230&&durations.arrivalObserved<=430);
  assert(samples.every(s=>s.otherOpacities.every(v=>v===1)),'only outgoing card dims');
  assert(reveal.every(s=>s.outgoing)&&dissolve.every(s=>s.outgoing));
  assert(dissolve.at(-1).opacity<.05,'outgoing disappears');
  assert(arrive.every(s=>!s.outgoing&&s.opacity===1&&s.innerOpacity===1&&s.rootOpacity===1&&s.label.endsWith(incoming.split(' · ')[1])),'incoming stays fully opaque');
  if(reduced){
   assert(reveal.every((s,i)=>i===0||s.opacity<=reveal[i-1].opacity+.01),'steady reduced-motion fade');
   assert(reveal.every(s=>s.transform==='none'),'no reduced-motion flip');
  }else{
   assert(reveal.filter(s=>s.at-reveal[0].at>350&&s.at-reveal[0].at<490).every(s=>s.opacity>.97),'early readable face');
   let flashes=0;for(let i=1;i<reveal.length;i++)if(reveal[i].opacity>reveal[i-1].opacity+.01)flashes++;
   assert(flashes>8,'visible flashes');assert(arrive.some(s=>s.transform!=='none'),'incoming flight preserved');
  }
  await capture();await page.getByRole('button',{name:/^Card 1 · /}).click();
  await page.locator('[data-replacement-stage=arrive]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-replacement-stage]')&&!!document.querySelector('.mega-draw-area>.mega-start')&&!document.querySelector('.mega-draw-area>.mega-start').disabled);
  const exposed=await page.evaluate(()=>{window.megaCapture=false;return window.megaSamples;});
  assert(exposed.length>5&&exposed.every(s=>s.stage==='arrive'&&!s.outgoing&&s.opacity===1),'exposed replacement unchanged');
  await page.getByRole('button',{name:'Stand Pat',exact:true}).click();await page.getByRole('button',{name:'Tap In?',exact:true}).click();
  await page.getByRole('region',{name:'Course scorecard',exact:true}).waitFor({timeout:20000});
  const alignment=await page.locator('.mega-result-scorecard table').evaluate(table=>{
   const head=[...table.querySelectorAll('thead th')],cells=[...table.querySelectorAll('tbody th,tbody td')];
   return {blank:cells[0].textContent,rows:[head,cells].map(row=>row.map(c=>({text:c.textContent,x:c.getBoundingClientRect().x,width:c.getBoundingClientRect().width}))),overflow:table.getBoundingClientRect().right>innerWidth};
  });
  assert.equal(alignment.blank,'');assert.equal(alignment.rows[0][0].text,'Hole');assert.equal(alignment.overflow,false);
  alignment.rows[0].forEach((cell,i)=>{assert(Math.abs(cell.x-alignment.rows[1][i].x)<.5);assert(Math.abs(cell.width-alignment.rows[1][i].width)<.5);});
  await page.waitForFunction(()=>{const paths=[...document.querySelectorAll('.mega-result-scorecard [data-mega-write] path')];return paths.length>0&&paths.every(p=>parseFloat(getComputedStyle(p).strokeDashoffset)<.01);});
  await page.screenshot({path:dir+label+'-scorecard.png'});
  assert(requests.every(r=>r.status===200));
  const committed=requests.filter(r=>r.request.op==='action').at(-1).data;
  assert.equal(committed.results.length,1);assert.equal(committed.phase,'scoring');
  assert.equal(await page.locator('.mega-result-scorecard tbody td').first().getAttribute('aria-label'),'Hole 1: '+(committed.results[0].score===0?'E':committed.results[0].score>0?'+'+committed.results[0].score:String(committed.results[0].score)));
  report.runs.push({label,lobby,durations,alignment,actions:requests.filter(r=>r.request.op==='action').map(r=>r.request.intent),committedResult:committed.results[0],samples,exposed});
  await context.close();console.log('PASS '+label+': lobby → opening → concealed/exposed replacement → committed hole scorecard');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
}finally{writeFileSync(dir+'report.json',JSON.stringify(report,null,2));await browser.close();}
