import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),evidence=[];
 await page.addInitScript(()=>{
  window.__tripAudio={starts:0,contexts:[]};
  const Base=window.AudioContext;
  window.AudioContext=class extends Base{constructor(...args){super(...args);window.__tripAudio.contexts.push(this);}};
  const start=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(...args){window.__tripAudio.starts++;return start.apply(this,args);};
 });
 await page.goto('http://127.0.0.1:5191/dev/trip-flip/live.html');
 for(const mode of ['solo Arcade','two-player table','solo Arcade']){
  const before=await page.evaluate(()=>window.__tripAudio.starts);
  await page.getByRole('button',{name:'Start '+mode,exact:true}).click();
  await page.locator('.trip-bank:not([disabled])').waitFor({timeout:15000});
  await page.locator('.trip-bank').click();await page.locator('.trip-round-result').waitFor();
  await page.waitForTimeout(1800);
  const after=await page.evaluate(()=>({starts:window.__tripAudio.starts,states:window.__tripAudio.contexts.map(c=>c.state)}));
  assert.ok(after.starts>before,mode+' has scheduled audio');
  assert.equal(after.states.length,1,'shared context survives mode switches');assert.equal(after.states[0],'running');
  evidence.push({mode,before,...after});await page.getByRole('button',{name:'Exit local preview'}).click();
 }
 writeFileSync('qualification.local/trip-flip/audio.json',JSON.stringify(evidence));
 console.log('PASS trusted-click Arcade → multiplayer → Arcade audio, one running shared AudioContext',evidence);
}finally{await browser.close();}
