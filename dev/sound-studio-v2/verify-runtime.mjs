import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin=process.env.SOUND_STUDIO_URL??'http://127.0.0.1:4328';
const browser=await chromium.launch({channel:'msedge'}),checks=[],errors=[];
try {
 for(const [label,options] of [['desktop',{viewport:{width:1100,height:850}}],['phone',{...devices['iPhone 13'],defaultBrowserType:undefined}]]){
  const context=await browser.newContext(options);
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await context.addInitScript(()=>{
   window.probe={events:[],stops:0};const Native=window.AudioContext;
   window.AudioContext=class extends Native{createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);
    n.start=(...args)=>{if(n.buffer?.length>1)window.probe.events.push(n.buffer.duration);return start(...args);};
    n.stop=(...args)=>{window.probe.stops++;return stop(...args);};return n;}};
  });
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto(origin+'/runtime.html');await page.locator('[data-ready="true"]').waitFor();
  const click=name=>page.getByRole('button',{name,exact:true}).click();
  const clear=()=>page.evaluate(()=>{window.probe.events=[];});
  const events=()=>page.evaluate(()=>window.probe.events);
  await click('Unmute');await page.waitForFunction(()=>window.runtimeDebug.manager.context?.state==='running',null,{timeout:10000});
  for(const [sound,duration] of [['noQualify',.42],['midnight',.95],['scorePost',.22],['yahtzee',1.2],['chucky',1.3],['myLeg',.68],['opponentLeg',.38],['sweep',1.6],['fiveOnes',1.12]]){
   await clear();await click(sound);
   if(['myLeg','opponentLeg','sweep'].includes(sound)){
    await page.waitForTimeout(50);assert.equal((await events()).length,0,'silent before actual '+sound+' animation');await click('Start animation');
   }
   if(sound==='fiveOnes')await page.waitForFunction(()=>document.querySelectorAll('[data-die-final-value=true]').length===5);
   await page.waitForFunction(()=>window.probe.events.length>0,null,{timeout:5000});
   assert.equal((await events()).length,1,label+' '+sound);assert(Math.abs((await events())[0]-duration)<.001,label+' '+sound+' duration');
   await page.waitForTimeout(duration*1000+80);
   if(sound==='sweep')await page.locator('[data-sweep-the-legs-overlay]').waitFor({state:'detached'});
   await click('Finish');
   checks.push(label+': '+sound+' exact approved recording at presentation');
  }
  await clear();await click('chucky');await page.waitForTimeout(100);assert.equal((await events()).length,0,'Chucky cooldown');
  await click('scorePost');await page.waitForTimeout(300);await clear();await click('Mute');await click('midnight');await click('Unmute');await page.waitForTimeout(200);assert.equal((await events()).length,0,'no muted catchup');
  await click('Visibility');await click('scorePost');await click('Visibility');await page.waitForTimeout(200);assert.equal((await events()).length,0,'no hidden catchup');
  await click('Post Quintzee');await page.waitForTimeout(100);assert.equal((await events()).length,1);assert(Math.abs((await events())[0]-1.2)<.001);await page.waitForTimeout(1400);assert.equal((await events()).length,1,'no Quintzee countup notes');
  await clear();await page.reload();await page.locator('[data-ready="true"]').waitFor();await page.waitForTimeout(150);assert.equal((await events()).length,0,'refresh silence');
  checks.push(label+': Chucky cooldown, muted/hidden consumption, Quintzee posting and refresh silence');
  await context.close();
 }
 assert.deepEqual(errors,[]);
 mkdirSync('qualification.local/sound-studio-v2',{recursive:true});
 writeFileSync('qualification.local/sound-studio-v2/runtime-report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
