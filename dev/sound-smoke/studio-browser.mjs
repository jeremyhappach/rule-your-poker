import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out='qualification.local/sound-smoke';mkdirSync(out,{recursive:true});
// The other two candidates are unchanged while the heartbeats use a real recording.
assert.equal(createHash('sha256').update(readFileSync('dev/sound-smoke/assets/357-beeps.wav')).digest('hex'),'4a5230f1bbaf2e2a6abcd815b2fcd9d7793e575d08d0461f10db86b9fc35e5a5');
assert.equal(createHash('sha256').update(readFileSync('dev/sound-smoke/assets/chucky-sting.wav')).digest('hex'),'a749db852de124ff4b6841eddf909e334cee34bdef852ebfae730f260acd6823');
assert.equal(createHash('sha256').update(readFileSync('dev/sound-smoke/sources/andy-jack-heartbeat-pair.wav')).digest('hex'),'b3def8839e5e0a1624a65277fca5959e355cbabff03cb6bd244f17bd4115fa40');
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],levels=[];
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<500});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.proof={starts:[],stops:0,outputs:[],flips:[]};const Real=AudioContext;
  document.addEventListener('transitionrun',event=>{const card=event.target.closest?.('[data-holm-chucky-flip-card]');if(card&&event.target===card.firstElementChild&&event.propertyName==='transform')window.proof.flips.push(performance.now());},true);
  window.AudioContext=class extends Real{
   createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...args)=>{if(n.buffer?.duration>.02){const entry={at:performance.now(),duration:n.buffer.duration};window.proof.starts.push(entry);n.addEventListener('ended',()=>{entry.endedAt=performance.now();},{once:true});}return start(...args);};n.stop=(...args)=>{window.proof.stops++;return stop(...args);};return n;}
   createGain(){
    const node=super.createGain(),connect=node.connect.bind(node),ctx=this;
    node.connect=(destination,...args)=>{
     const result=connect(destination,...args);
     if(destination===ctx.destination){
      // Read the actual engine output on a silent side branch, without changing playback.
      const analyser=ctx.createAnalyser(),silent=Real.prototype.createGain.call(ctx),data=new Float32Array(2048);
      analyser.fftSize=2048;silent.gain.value=0;connect(analyser);analyser.connect(silent);silent.connect(ctx.destination);
      const output={peakRms:0};window.proof.outputs.push(output);
      const timer=setInterval(()=>{analyser.getFloatTimeDomainData(data);output.peakRms=Math.max(output.peakRms,Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length));},10);
      setTimeout(()=>{clearInterval(timer);analyser.disconnect();silent.disconnect();},6500);
     }return result;
    };return node;
   }
  };
 });
 await page.goto('http://127.0.0.1:4320');await page.getByRole('button',{name:'Mute sounds'}).waitFor();
 if(width===390){
  // Compare speaker-range energy with the audible beep over the same first 400 ms.
  // Keep this stricter gate: lowering it to 120 Hz admitted the inaudible bass-heavy recording.
  // Real-recording EQ meets the gate without adding synthetic tones. Listening remains acceptance.
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
  for(const level of levels){assert.ok(level.above300Rms>=beep.above300Rms*.75,level.id+' speaker-range signal must be within 2.5 dB of the audible beep');assert.ok(level.peak<.5,level.id+' headroom');assert.ok(level.identicalBeats,level.id+' identical countdown beats');}
 }
 for(const attempt of ['initial','after-reload']){
 if(attempt==='after-reload'){await page.reload();await page.getByRole('button',{name:'Mute sounds'}).waitFor();}
 for(const id of ['chucky-heartbeat','chucky-sting','357-beeps','357-heartbeat']){
  const card=page.locator('[id="'+id+'"]');await card.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>window.proof.starts.length);
  const beforeOutputs=await page.evaluate(()=>window.proof.outputs.length);
  const beforeFlips=await page.evaluate(()=>window.proof.flips.length);
  await card.getByRole('button',{name:'Play preview'}).click();await card.getByRole('button',{name:'Stop',exact:true}).waitFor();await card.getByRole('button',{name:'Play preview'}).waitFor({timeout:10000});
  const after=await page.evaluate(()=>window.proof.starts.slice());const added=after.slice(before);
  const outputs=await page.evaluate(before=>window.proof.outputs.slice(before),beforeOutputs);
  if(id==='chucky-heartbeat'){
   const heartbeats=added.filter(source=>source.duration>1),flips=await page.evaluate(before=>window.proof.flips.slice(before),beforeFlips);
   assert.equal(heartbeats.length,4,'one independent four-pair heartbeat sequence');assert.equal(flips.length,4,'four actual card flips');
   assert.ok(heartbeats[3].endedAt<flips[3],'last complete heartbeat ends before final flip');
   for(let i=1;i<4;i++)assert.ok(heartbeats[i].at-heartbeats[i-1].at<flips[i]-flips[i-1],'heartbeat cadence is faster than card cadence');
   // The ordinary final-card flip may sound once the heartbeat has ended; it must not overlap.
   for(const other of added.filter(source=>source.duration<=1))assert.ok(other.at>heartbeats[3].endedAt,'card flip cannot compete with heartbeat');
  }else assert.equal(added.length,id.startsWith('357')?3:1,id+' source starts '+attempt);
  assert.equal(outputs.length,added.length,id+' connected output graphs');
  for(const output of outputs)assert.ok(output.peakRms>.001,id+' real engine output must contain signal');
  checks.push({width,id,attempt,starts:added,outputs});
 }
 }
 await page.screenshot({path:out+'/studio-'+width+'.png',fullPage:true});
 await page.getByRole('button',{name:'Mute sounds'}).click();const before=await page.evaluate(()=>window.proof.starts.length);
 await page.locator('#chucky-heartbeat').getByRole('button',{name:'Play preview'}).click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.proof.starts.length),before);
 assert.deepEqual(errors,[]);await page.close();
}writeFileSync(out+'/studio-browser.json',JSON.stringify({passed:true,checks,levels},null,2));console.log('PASS: four previews before/after reload at desktop/phone widths; measured native engine output; speaker-range levels within 2.5 dB of beeps; identical countdown beats; mute; zero page errors');}finally{await browser.close();}
