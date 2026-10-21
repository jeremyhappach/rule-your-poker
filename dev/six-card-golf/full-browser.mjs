import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),base='http://127.0.0.1:5198';
const browser=await chromium.launch({headless:true,executablePath}),errors=[],post=async(op,body)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)});return r.json();};
try{
 const endSession=process.argv.includes('--end-session'),f=await post('new',{players:2,endSession}),pages=[];assert.ok(f.id);
 const snap=async(user=f.user)=>{const v=await post('rpc',{user,name:'golf_snapshot',args:{p_dealer_game_id:f.id}});if(v.error)throw Error(v.error.message);return v.data;};
 for(const user of f.users){const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(f=>{sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f));window.__golfAudioStarts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.__golfAudioStarts++;return start.apply(this,a);};},f);
  await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+user,{waitUntil:'domcontentloaded'});await p.locator('.golf-local').waitFor();
 }
 let moves=0,v=await snap(),lastHole=0;
 while(v.phase!=='complete'){
  assert.ok(moves<500,'bounded full match');
  if(v.hole!==lastHole){console.log('Browser hole',v.hole);lastHole=v.hole;}
  if(v.phase==='hole_complete'){await pages[0].waitForTimeout(300);v=await snap();continue;}
  assert.equal(v.paused,false,'active humans do not time out');
  const actor=v.players[v.turnIndex],p=pages[f.users.indexOf(actor.userId)],revision=v.revision;
  if(v.phase==='opening'){
   await p.locator('[data-golf-position="0"]:not([disabled])').click();await p.locator('[data-golf-position="3"]:not([disabled])').click();await p.getByRole('button',{name:'Reveal selected two',exact:true}).click();
  }else if(!v.hasPending)await p.locator('[data-golf-stock]:not([disabled])').click();
  else{const board=v.tableaus[actor.id],index=board.exposed.findIndex(x=>!x);await p.locator('[data-golf-position="'+(index<0?0:index)+'"]:not([disabled])').click();}
  for(let i=0;i<100;i++){v=await snap();if(v.revision>revision)break;await p.waitForTimeout(50);}assert.ok(v.revision>revision);moves++;
 }
 assert.equal(v.holes.length,9);assert.ok(v.settlement);assert.equal(Object.values(v.financial.balances).reduce((a,b)=>a+b,0),200);
 await pages[0].waitForFunction(()=>!!window.__golfCompleted,null,{timeout:20000});
 const sounds=await Promise.all(pages.map(p=>p.evaluate(()=>window.__golfAudioStarts)));assert.ok(sounds.some(n=>n>0),'real shared audio nodes started');
 if(endSession){
  await pages[0].locator('[data-session-ended-panel]').waitFor();assert.equal(await pages[0].locator('[data-golf-position]').count(),0);assert.equal(await pages[0].locator('[data-chip-balance-delta]').count(),0);assert.equal(await pages[0].locator('.golf-controls,.golf-hole-result,[data-public-seat-tableau]').count(),0);
  await pages[0].screenshot({path:'qualification.local/six-card-golf/session-ended.png'});
  const before=await snap();await pages[0].getByRole('button',{name:'Back to Lobby'}).click();await pages[0].locator('[data-local-lobby]').waitFor();assert.deepEqual((await snap()).settlement,before.settlement);
 }
 await pages[0].reload({waitUntil:'domcontentloaded'});await pages[0].locator(endSession?'[data-local-lobby]':'.golf-local').waitFor();await pages[0].waitForTimeout(300);assert.equal(await pages[0].evaluate(()=>window.__golfAudioStarts),0,'cold mount does not replay card audio');
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/six-card-golf/'+(endSession?'session-ended-browser':'full-browser')+'.json',JSON.stringify({passed:true,id:f.id,moves,sounds,holes:9,settlement:v.settlement,endSession,errors}));
 console.log('PASS two-human nine-hole browser match, shared audio nodes, terminal completion, cold replay silence');
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
