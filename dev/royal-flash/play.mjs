import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),errors=[],evidence=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__royalAudio={contexts:[],starts:0};const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);window.__royalAudio.contexts.push(this);}createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(...args)=>{window.__royalAudio.starts++;return start(...args);};return osc;}};});
 await page.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');await page.getByRole('button',{name:'Start solo Arcade'}).click();
 for(let round=1;round<=2;round++){
  const card=page.locator('.royal-grid button').first();await card.waitFor();await card.click({timeout:10000});
  const take=page.getByRole('button',{name:'Take Score'});await take.click();await page.getByRole('status').filter({hasText:'Score taken'}).waitFor();
  if(round===1)await page.getByRole('status').filter({hasText:'Score taken'}).waitFor({state:'hidden',timeout:10000});
 }
 await page.getByRole('heading',{name:'Royal Flash leaderboard'}).waitFor({timeout:15000});evidence.push('Arcade: two rounds, authoritative results, leaderboard return');
 const firstAudio=await page.evaluate(()=>({contexts:window.__royalAudio.contexts.length,starts:window.__royalAudio.starts,state:window.__royalAudio.contexts[0]?.state}));assert.equal(firstAudio.contexts,1);assert.ok(firstAudio.starts>0);assert.equal(firstAudio.state,'running');
 await page.evaluate(()=>window.__royalAudio.contexts[0].suspend());
 await page.getByRole('button',{name:'Start two-player table'}).click();await page.locator('.royal-grid button').first().waitFor();
 const firstUrl=new URL(page.url()),secondUrl=new URL(page.url());
 const other=await page.locator('a').filter({hasText:'Open player two'}).getAttribute('href');secondUrl.search=new URL(other,page.url()).search;
 const second=await browser.newPage({viewport:{width:1440,height:900}});second.on('pageerror',e=>errors.push(e.message));await second.goto(secondUrl.toString());
 for(let turn=0;turn<4;turn++){
  const actor=turn%2===0?page:second,card=actor.locator('.royal-grid button').first();
  await card.click({timeout:13000});await actor.getByRole('button',{name:'Take Score'}).click();
  await actor.getByRole('status').filter({hasText:'Score taken'}).waitFor();
  await actor.getByRole('status').filter({hasText:'Score taken'}).waitFor({state:'hidden',timeout:10000});
 }
 await page.getByRole('status').filter({hasText:'Game Over'}).waitFor({timeout:10000});evidence.push('Multiplayer: both participants, two rounds, terminal result');
 const afterAudio=await page.evaluate(()=>({contexts:window.__royalAudio.contexts.length,starts:window.__royalAudio.starts,state:window.__royalAudio.contexts[0]?.state}));assert.equal(afterAudio.contexts,1);assert.ok(afterAudio.starts>firstAudio.starts);assert.equal(afterAudio.state,'running');evidence.push('Desktop Chromium: first-game audio, Arcade to multiplayer, suspended context resumed by normal start gesture, one shared context');
 await page.getByRole('button',{name:'Return to preview'}).click();await page.getByRole('button',{name:'Start solo Arcade'}).click();await page.locator('.royal-grid button').first().click({timeout:10000});
 const reverseAudio=await page.evaluate(()=>({contexts:window.__royalAudio.contexts.length,starts:window.__royalAudio.starts}));assert.equal(reverseAudio.contexts,1);assert.ok(reverseAudio.starts>afterAudio.starts);
 await page.reload();await page.getByRole('progressbar',{name:'Round time remaining'}).waitFor();assert.equal(await page.evaluate(()=>window.__royalAudio.starts),0,'reconnect does not replay intro or previous placement');
 await page.locator('.royal-grid button').nth(1).click();await page.waitForFunction(()=>window.__royalAudio.starts>0);evidence.push('Desktop Chromium: multiplayer to Arcade, reload restores playing phase silently, next ordinary play unlocks audio');
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/royal-flash/play.json',JSON.stringify({evidence,errors}));console.log(evidence);
}finally{await browser.close();}
