import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,localContext} from './database.mjs';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),db=await connect(localContext().database),errors=[],evidence=[];
const audio=page=>page.evaluate(()=>({contexts:window.__royalAudio.contexts.length,starts:window.__royalAudio.starts,state:window.__royalAudio.contexts[0]?.state}));
async function makePage(){const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.__royalAudio={contexts:[],starts:0};const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);window.__royalAudio.contexts.push(this);}createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(...args)=>{window.__royalAudio.starts++;return start(...args);};return osc;}};});return page;}
try{
 const page=await makePage();page.setDefaultTimeout(12000);console.log('Fresh multiplayer');await page.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');await page.getByRole('button',{name:'Start two-player table'}).click();
 const other=await page.getByText('Open player two').getAttribute('href'),second=await makePage();await second.goto(new URL(other,page.url()).toString());
 second.setDefaultTimeout(12000);const identity=Object.fromEntries(new URL(page.url()).searchParams);await page.locator('.royal-grid button').first().click({timeout:12000});
 const watcher=await makePage();watcher.setDefaultTimeout(12000);await watcher.goto(new URL(await page.getByText('Open spectator').getAttribute('href'),page.url()).toString());await watcher.getByRole('progressbar').waitFor();assert.equal(await watcher.locator('.royal-grid button:disabled').count(),25);assert.ok(await watcher.getByRole('button',{name:'Take Score'}).isDisabled());assert.equal((await audio(watcher)).starts,0,'spectator mount is silent');
 assert.equal((await audio(page)).contexts,1);assert.ok((await audio(page)).starts>0,'fresh multiplayer audio');
 await page.evaluate(()=>{window.__royalSeen={chip:false,celebration:false,balances:[]};new MutationObserver(()=>{if(document.querySelector('[data-chip-transport-intent]'))window.__royalSeen.chip=true;if(document.querySelector('canvas'))window.__royalSeen.celebration=true;const balances=[...document.querySelectorAll('[data-chip-center]')].map(e=>e.textContent);if(balances.length)window.__royalSeen.balances=balances;}).observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});});
 for(let i=1;i<24;i++)await page.locator('.royal-grid button').nth(i).click();
 const score=Number((await page.locator('.royal-primary-score strong').innerText()).replaceAll(',',''));assert.ok(score>0,'live scored board');
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.royal-grid button').nth(24).click();await page.getByRole('status').filter({hasText:'Grid complete'}).waitFor();
 await watcher.getByRole('button',{name:'History',exact:true}).click();await watcher.getByRole('dialog').getByText(/Round 1/).waitFor();await watcher.getByRole('button',{name:'Close',exact:true}).click();
 for(let turn=1;turn<4;turn++){
  const actor=turn%2?second:page;await actor.locator('.royal-grid button').first().click({timeout:30000});await actor.getByRole('button',{name:'Take Score'}).click();await actor.getByRole('status').filter({hasText:'Score taken'}).waitFor();
 }
 await page.getByRole('status').filter({hasText:'Game Over'}).waitFor({timeout:30000});const gameOver=await page.getByRole('status').filter({hasText:'Game Over'}).innerText();assert.match(gameOver,/wins/);
 const terminal=await page.evaluate(async f=>(await (await fetch('/__royal/state',{method:'POST',body:JSON.stringify(f)})).json()),identity);
 for(const p of terminal.players.filter(p=>!terminal.terminal.winnerIds.includes(p.id)))assert.ok(!gameOver.includes(p.name),'no losing player achievement announcement');
 await page.getByRole('button',{name:'Start solo Arcade'}).waitFor({timeout:30000});assert.ok(await page.evaluate(()=>window.__royalCompleted),'automatic terminal handoff');
 const seen=await page.evaluate(()=>window.__royalSeen);assert.equal(seen.chip,true,'canonical chip flight');assert.equal(seen.celebration,true,'winner celebration');assert.ok(seen.balances.some(s=>s.includes('105'))&&seen.balances.some(s=>s.includes('95')),'canonical visible balances');
 const rows=(await db.query('SELECT chips FROM public.players WHERE game_id=$1 AND position IS NOT NULL ORDER BY chips',[identity.session])).rows;assert.deepEqual(rows.map(r=>r.chips),[95,105]);
 evidence.push({case:'fresh multiplayer, actual RoyalFlashTable, spectator restrictions/history, live score, winner, canonical balances, automatic handoff',seen,gameOver});
 console.log('Canonical terminal passed',seen);await page.evaluate(()=>window.__royalAudio.contexts[0].suspend());await page.getByRole('button',{name:'Start solo Arcade'}).click();await page.locator('.royal-grid button').first().click({timeout:30000});assert.equal((await audio(page)).state,'running');assert.equal((await audio(page)).contexts,1);
 const before=await audio(page);await page.reload();await page.getByRole('progressbar',{name:'Round time remaining'}).waitFor();assert.equal((await audio(page)).starts,0,'reload silent');
 console.log('Reloaded Arcade');await page.locator('.royal-grid button').nth(1).click();await page.waitForFunction(()=>window.__royalAudio.starts>0);
 // Visibility events exercise the shared owner; this is desktop simulation, not iOS evidence.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 const hidden=await audio(page);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(250);assert.equal((await audio(page)).starts,hidden.starts,'background recovery does not replay cues');await page.locator('.royal-grid button').nth(2).click();
 await page.getByRole('button',{name:'Take Score'}).click();await page.getByRole('status').filter({hasText:'Score taken'}).waitFor();await page.getByRole('status').filter({hasText:'Score taken'}).waitFor({state:'hidden',timeout:30000});
 await page.locator('.royal-grid button').first().click({timeout:30000});await page.getByRole('button',{name:'Take Score'}).click();await page.getByRole('heading',{name:'Royal Flash leaderboard'}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Start two-player table'}).click();await page.locator('.royal-grid button').first().click({timeout:30000});assert.equal((await audio(page)).contexts,1);
 evidence.push({case:'multiplayer → Arcade → multiplayer; resume via start/play; reload and simulated background silent; Arcade leaderboard',before});
 const fresh=await makePage();fresh.setDefaultTimeout(12000);await fresh.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');await fresh.getByRole('button',{name:'Start solo Arcade'}).click();await fresh.locator('.royal-grid button').first().click({timeout:30000});assert.ok((await audio(fresh)).starts>0,'fresh solo sounds');
 await fresh.evaluate(async()=>{const {platformAudio}=await import('/src/lib/audio/platformAudio.ts');platformAudio.setPreference(new URLSearchParams(location.search).get('user'),false);});
 const muted=await audio(fresh);await fresh.locator('.royal-grid button').nth(1).click();assert.equal((await audio(fresh)).starts,muted.starts,'mute respected');
 await fresh.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');await fresh.waitForTimeout(100);assert.equal((await audio(fresh)).starts,0,'navigation retires old audio');
 const blocked=await makePage();blocked.setDefaultTimeout(12000);await blocked.addInitScript(()=>{window.AudioContext=class{constructor(){throw Error('Audio blocked for qualification');}};});await blocked.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');await blocked.getByRole('button',{name:'Start solo Arcade'}).click();await blocked.locator('.royal-grid button').first().click({timeout:30000});await blocked.getByRole('progressbar',{name:'Round time remaining'}).waitFor();assert.equal((await audio(blocked)).starts,0,'audio failure leaves gameplay active');
 evidence.push({case:'fresh Arcade, mute, navigation cleanup, blocked Web Audio never blocks play'});
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/royal-flash/acceptance.json',JSON.stringify({evidence,errors},null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();await db.end();}
