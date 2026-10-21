import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),errors=[],evidence=[];
const base='http://127.0.0.1:5227',post=async(op,body)=>{const r=await fetch(base+'/__race_poker/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok||v.error)throw Error(JSON.stringify(v));return v.data??v;};
const state=f=>post('rpc',{user:f.user,name:'race_poker_snapshot',args:{p_dealer_game_id:f.id}});
try{for(const mode of [{real:false,bot:false,draw:false},{real:true,bot:true,draw:false},{real:false,draw:true},{real:true,draw:true}]){
 const f=await post('new',mode),pages=[];
 for(const user of [f.user,...(!mode.bot&&!mode.draw?[f.other]:[])]){const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.__chipFlights=[];new MutationObserver(()=>{for(const e of document.querySelectorAll('[data-chip-transport-intent]')){const id=e.getAttribute('data-chip-transport-intent');if(!window.__chipFlights.includes(id))window.__chipFlights.push(id);}}).observe(document,{subtree:true,childList:true});});await p.goto(base+'/dev/race-poker/live.html?'+new URLSearchParams({id:f.id,session:f.session,user}));await p.locator('.race-plane').waitFor();pages.push(p);}
 const p1=pages[0];let commands=[];
 if(!mode.draw){
  await p1.locator('.race-choices button:enabled').first().waitFor();
  if(!mode.real){
   let dropped=false;await p1.route('**/__race_poker/rpc',async route=>{const body=route.request().postDataJSON();if(body.name==='race_poker_action'){commands.push(body.args);if(!dropped){dropped=true;await route.fetch();await route.abort('failed');return;}}await route.continue();});
   await p1.locator('.race-choices button').first().click();await p1.waitForFunction(()=>Object.keys(sessionStorage).some(k=>k.startsWith('ptown:race-poker:1:')));
   await p1.waitForTimeout(200);assert.equal((await state(f)).hand.length,1);
   await p1.evaluate(()=>window.dispatchEvent(new Event('online')));await p1.waitForFunction(()=>!Object.keys(sessionStorage).some(k=>k.startsWith('ptown:race-poker:1:')));
   assert.ok(commands.length>=2);assert.deepEqual(commands[0],commands[1]);assert.equal((await state(f)).hand.length,1);
   await p1.reload();await p1.locator('.race-choices button:enabled').first().waitFor();assert.deepEqual(await p1.evaluate(()=>window.__racePokerCues),[]);assert.equal(await p1.locator('.race-hand>[data-filled=true]').count(),1);
  }
  for(let i=mode.real?0:1;i<5;i++){await p1.locator('.race-choices button:enabled').first().waitFor();await p1.locator('.race-choices button').first().click();await p1.waitForFunction(n=>document.querySelectorAll('.race-hand>[data-filled=true]').length===n,i+1);}
  await p1.waitForTimeout(400);const displayed=Number((await p1.locator('.race-score[data-active=true] strong').textContent()).replaceAll(',',''));assert.ok(displayed>47000&&displayed<51500,'score counts from previous bank to committed award');
  let s=await state(f);assert.equal(s.phase,'stage_complete');assert.equal(s.result.points,4500);assert.equal(s.scores[f.players[0]],51500);assert.equal(s.settlement,null);assert.deepEqual(s.choices,[]);assert.equal(s.deck,undefined);
  if(!mode.bot){const p2=pages[1];await p2.getByText('Final hand',{exact:true}).waitFor();for(let i=0;i<5;i++){await p2.locator('.race-choices button:enabled').first().waitFor();await p2.locator('.race-choices button').first().click();await p2.waitForFunction(n=>document.querySelectorAll('.race-hand>[data-filled=true]').length===n,i+1);}}
 }
 await p1.waitForFunction(()=>!!window.__racePokerCompleted,{},{timeout:20000});
 const end=await state(f);assert.equal(end.finished,true);assert.equal(end.phase,'complete');assert.ok(end.settlement);assert.equal(end.financial.balances[f.players[0]],mode.draw?100:105);assert.equal(end.financial.balances[f.players[1]],mode.draw?100:95);
 assert.equal(await p1.locator('.race-choices button').count(),0);assert.equal(await p1.locator('.race-horse').count(),2);
 const pills=await p1.locator('.race-score small').allTextContents();assert.deepEqual(pills.map(t=>Number(t.match(/\d+/)[0])).sort((a,b)=>a-b),mode.draw?[100,100]:[95,105]);
 await p1.screenshot({path:`qualification.local/race-poker/browser-${mode.real?'real':'fake'}-${mode.draw?'draw':'winner'}.png`});
 const flights=await p1.evaluate(()=>window.__chipFlights);assert.equal(flights.length,mode.draw?0:1,'canonical chip transport visible exactly once');
 const cues=await p1.evaluate(()=>window.__racePokerCues);if(mode.draw)assert.ok(cues.every(id=>!id.includes(':victory:')));else assert.ok(cues.some(id=>id.includes(':victory:')));
 evidence.push({flights,cues,fixture:f,finished:end.finished,balances:end.financial.balances,settlement:end.settlement,batch:end.financial.batch?.id,originalRetry:commands.length});
 for(const p of pages)await p.close();console.log('PASS SQL-backed '+JSON.stringify(mode));
}assert.deepEqual(errors,[]);writeFileSync('qualification.local/race-poker/browser.json',JSON.stringify({passed:true,at:new Date().toISOString(),evidence,errors}));
}finally{await browser.close();}
