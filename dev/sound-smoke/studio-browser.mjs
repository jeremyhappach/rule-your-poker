import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out='qualification.local/sound-smoke';mkdirSync(out,{recursive:true});
// The working beep candidate is unchanged while the other candidates gain audible upper partials.
assert.equal(createHash('sha256').update(readFileSync('dev/sound-smoke/assets/357-beeps.wav')).digest('hex'),'4a5230f1bbaf2e2a6abcd815b2fcd9d7793e575d08d0461f10db86b9fc35e5a5');
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],levels=[];
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<500});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.proof={starts:[],stops:0};const Real=AudioContext;window.AudioContext=class extends Real{createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...args)=>{if(n.buffer?.duration>.02)window.proof.starts.push({at:performance.now(),duration:n.buffer.duration});return start(...args);};n.stop=(...args)=>{window.proof.stops++;return stop(...args);};return n;}};});
 await page.goto('http://127.0.0.1:4320');await page.getByRole('button',{name:'Mute sounds'}).waitFor();
 if(width===390){
  // A small-speaker proxy: remove bass below 300 Hz and compare the first 400 ms.
  // This checks useful signal, not merely whether a source was started; physical listening remains acceptance.
  levels.push(...await page.evaluate(async()=>{
   const results=[];
   for(const id of ['chucky-heartbeat','chucky-sting','357-beeps','357-heartbeat']){
    const bytes=await(await fetch('/assets/'+id+'.wav')).arrayBuffer();
    const ctx=new OfflineAudioContext(1,12800,32000),source=ctx.createBufferSource();source.buffer=await ctx.decodeAudioData(bytes);
    let output=source;for(let i=0;i<2;i++){const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=300;filter.Q.value=-3.0103;output.connect(filter);output=filter;}
    output.connect(ctx.destination);source.start();const rendered=(await ctx.startRendering()).getChannelData(0);
    const samples=source.buffer.getChannelData(0),rms=Math.sqrt(rendered.reduce((sum,v)=>sum+v*v,0)/rendered.length);
    const peak=samples.reduce((max,v)=>Math.max(max,Math.abs(v)),0);
    const countBeatFrames=28800;
    const identicalBeats=!id.startsWith('357')||[1,2].every(beat=>samples.slice(0,countBeatFrames).every((sample,i)=>sample===samples[beat*countBeatFrames+i]));
    results.push({id,above300Rms:rms,peak,identicalBeats});
   }return results;
  }));
  const beep=levels.find(x=>x.id==='357-beeps');
  for(const level of levels){assert.ok(level.above300Rms>=beep.above300Rms*.35,level.id+' loses too much audible signal without bass');assert.ok(level.peak<.3,level.id+' headroom');assert.ok(level.identicalBeats,level.id+' identical countdown beats');}
 }
 for(const attempt of ['initial','after-reload']){
 if(attempt==='after-reload'){await page.reload();await page.getByRole('button',{name:'Mute sounds'}).waitFor();}
 for(const id of ['chucky-heartbeat','chucky-sting','357-beeps','357-heartbeat']){
  const card=page.locator('[id="'+id+'"]');await card.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>window.proof.starts.length);
  await card.getByRole('button',{name:'Play preview'}).click();await card.getByRole('button',{name:'Stop',exact:true}).waitFor();await card.getByRole('button',{name:'Play preview'}).waitFor({timeout:10000});
  const after=await page.evaluate(()=>window.proof.starts.slice());const added=after.slice(before);
  assert.equal(added.length,id.startsWith('357')?3:1,id+' source starts '+attempt);checks.push({width,id,attempt,starts:added});
 }
 }
 await page.screenshot({path:out+'/studio-'+width+'.png',fullPage:true});
 await page.getByRole('button',{name:'Mute sounds'}).click();const before=await page.evaluate(()=>window.proof.starts.length);
 await page.locator('#chucky-heartbeat').getByRole('button',{name:'Play preview'}).click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.proof.starts.length),before);
 assert.deepEqual(errors,[]);await page.close();
}writeFileSync(out+'/studio-browser.json',JSON.stringify({passed:true,checks,levels},null,2));console.log('PASS: four native-audio previews before/after reload at desktop and phone widths; useful signal above 300 Hz; unchanged beeps; identical countdown beats; mute; zero page errors');}finally{await browser.close();}
