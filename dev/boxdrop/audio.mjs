import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),evidence=[];
 await page.addInitScript(()=>{window.__boxAudio={starts:0,contexts:[]};const Base=window.AudioContext;window.AudioContext=class extends Base{constructor(...args){super(...args);window.__boxAudio.contexts.push(this);}};const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){window.__boxAudio.starts++;return start.apply(this,args);};});
 await page.goto('http://127.0.0.1:5194/dev/boxdrop/live.html');
 for(const mode of ['solo Arcade','two-player table','solo Arcade']){
  await page.getByRole('button',{name:'Start '+mode,exact:true}).click();await page.locator('.box-bank:not([disabled])').waitFor({timeout:15000});
  const before=await page.evaluate(()=>window.__boxAudio.starts);await page.locator('.box-shaft').first().click();await page.waitForTimeout(300);
  const after=await page.evaluate(()=>({starts:window.__boxAudio.starts,states:window.__boxAudio.contexts.map(c=>c.state)}));
  assert.ok(after.starts>before,mode+' schedules placement audio');assert.equal(after.states.length,1);assert.equal(after.states[0],'running');
  evidence.push({mode,before,...after});await page.getByRole('button',{name:'Exit local preview'}).click();
 }
 writeFileSync('qualification.local/boxdrop/audio.json',JSON.stringify(evidence));console.log('PASS Arcade → multiplayer → Arcade placement audio with one running shared AudioContext');
}finally{await browser.close();}
