import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const bundled=await build({stdin:{contents:`
 import {celebrationCueAt} from './src/lib/audio/celebrationCue';
 import {cardSwooshCueAt} from './src/lib/audio/cardSwoosh';
 import {triAllClearCueAt} from './src/lib/triTowers/allClearCue';
 import {triSwooshCueAt} from './src/lib/triTowers/cardSwoosh';
 window.renderCue=async(kind)=>{
  const fan=kind.includes('fanfare'),length=fan?3100:150;
  const context=new OfflineAudioContext(1,Math.ceil(48000*length/1000),48000);
  const fn=kind==='fanfare'?celebrationCueAt:kind==='tri-fanfare'?triAllClearCueAt:kind==='swoosh'?cardSwooshCueAt:triSwooshCueAt;
  // Offline contexts start suspended. Only the test adapter supplies the live admission state;
  // all synthesis, native nodes and envelopes are the unchanged production cue.
  const native=new Proxy(context,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  fn(0,fan?3000:100).schedule(native,context.destination,n=>n);
  const samples=(await context.startRendering()).getChannelData(0);
  let peak=0,last=0,energy=0;for(let i=0;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));energy+=samples[i]*samples[i];if(Math.abs(samples[i])>1e-7)last=i;}
  return {peak,energy,endMs:last/48};
 };`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.setContent('<title>Run21 shared audio proof</title>');
 await page.addScriptTag({content:bundled.outputFiles[0].text});
 for(const kind of ['fanfare','swoosh']){
  const current=await page.evaluate(kind=>window.renderCue(kind),kind);
  const reference=await page.evaluate(kind=>window.renderCue(kind),'tri-'+kind);
  assert.deepEqual(current,reference);assert(current.peak>.01);assert(current.energy>0);
  assert(current.endMs>(kind==='fanfare'?2900:90)&&current.endMs<(kind==='fanfare'?3000:101));
  console.log(kind,JSON.stringify(current),'matches TriTowers native Web Audio render');
 }
}finally{await browser.close();}
