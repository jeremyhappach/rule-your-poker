import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
try {
 const evidence=await Promise.all([true,false].map(async solo=>{
  const page=await browser.newPage({viewport:solo?{width:390,height:844}:{width:844,height:390}});
  await page.addInitScript(()=>{
   window.__sync={sounds:[],steps:[]};
   const Native=window.AudioContext;
   window.AudioContext=class extends Native {
    createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(at=0)=>{window.__sync.sounds.push(performance.now()+1000*(at-this.currentTime));return start(at);};return osc;}
   };
   addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{
    const step=document.querySelector('.royal-breakdown')?.getAttribute('data-scoring-step');
    if(step&&step!==window.__sync.steps.at(-1)?.step)window.__sync.steps.push({step,at:performance.now(),highlight:document.querySelectorAll('.royal-grid [data-scored]').length});
   }).observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true}));
  });
  try {
   await page.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');
   await page.getByRole('button',{name:solo?'Start solo Arcade':'Start two-player table'}).click();
   for(let i=0;i<25;i++)await page.locator('.royal-grid button').nth(i).click();
   await page.locator('[data-scoring-step="line-3"]').waitFor();
   const f=Object.fromEntries(new URL(page.url()).searchParams);
   const state=await page.evaluate(async f=>(await (await fetch('/__royal/state',{method:'POST',body:JSON.stringify(f)})).json()),f);
   const result=solo?state.view.result:state.stages.at(-1),seen=await page.evaluate(()=>window.__sync);
   const deltas=seen.steps.filter(x=>/^line-[0-3]$/.test(x.step)).map(x=>{
    assert.equal(x.highlight,5);const line=Number(x.step.slice(5));
    if(!result.lines[line].points)return null;
    const nearest=Math.min(...seen.sounds.map(t=>Math.abs(t-x.at)));assert.ok(nearest<100,`${solo}: ${x.step} sound/visual difference ${nearest}ms`);return nearest;
   }).filter(x=>x!==null);
   assert.ok(deltas.length,'at least one positive scored line');
   // Visibility recovery cancels the existing schedule and seeks forward silently.
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   const soundCount=await page.evaluate(()=>window.__sync.sounds.length);
   await page.waitForTimeout(1800);
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
   await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>window.__sync.sounds.length),soundCount);
   assert.ok(Number((await page.locator('.royal-breakdown').getAttribute('data-scoring-step')).slice(5))>=4);
   await page.reload();await page.locator('.royal-breakdown').waitFor();
   assert.equal(await page.evaluate(()=>window.__sync.sounds.length),0,'reconnect must not replay scoring sounds');
   const recovered=await page.evaluate(async f=>(await (await fetch('/__royal/state',{method:'POST',body:JSON.stringify(f)})).json()),f);
   assert.deepEqual(solo?recovered.view.result:recovered.stages.at(-1),result,'result and awarded total remain immutable');
   assert.ok(Number((await page.locator('.royal-breakdown').getAttribute('data-scoring-step')).slice(5))>=4,'reconnect seeks past completed lines');
   return {solo,soundVisualDeltasMs:deltas,backgroundSeeksSilently:true,reconnectSeeksSilently:true,immutableResult:true};
  } finally {await page.close();}
 }));
 writeFileSync('qualification.local/royal-flash/sync-recovery.json',JSON.stringify(evidence,null,2));console.log(evidence);
} finally {await browser.close();}
