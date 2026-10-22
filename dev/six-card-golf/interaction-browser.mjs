import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const baseline=process.argv.includes('--baseline'),base='http://127.0.0.1:5198',e={baseline,passed:false,errors:[],actions:[]};
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
const post=async(op,body)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)});return r.json();};
const rpc=async(user,name,args)=>{const r=await post('rpc',{user,name,args});assert.equal(r.error,null);return r.data;};
try{
 const f=await post('new',{players:2});assert(f.id);const pages=[];
 for(const user of f.users){const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});pages.push(p);p.on('pageerror',x=>e.errors.push(x.message));await p.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+user);await p.locator('.golf-local').waitFor();}
 const snap=user=>rpc(user,'golf_snapshot',{p_dealer_game_id:f.id});
 for(let i=0;i<2;i++){
  const before=await snap(f.users[0]),actor=before.players[before.turnIndex],p=pages[f.users.indexOf(actor.userId)];
  const first=p.locator('[data-golf-position="0"]');await first.tap();assert.equal(await first.getAttribute('aria-pressed'),'true');
  e.selection={pressed:true,highlight:await first.locator('[data-playing-card-highlight],.golf-selection').count(),text:await p.locator(baseline?'.golf-info':'.golf-identity').innerText()};
  if(baseline){await p.screenshot({path:'qualification.local/six-card-golf/opening-selection-before.png'});assert.equal(e.selection.highlight,0);e.passed=true;break;}
  assert.equal(e.selection.highlight,1);assert.deepEqual((await snap(actor.userId)).tableaus[actor.id].cards,Array(6).fill(null));
  await p.locator('[data-golf-position="3"]').tap();
  await p.waitForFunction(()=>document.querySelector('[data-golf-position="0"]')?.getAttribute('aria-label')?.includes('face down')===false);
  const after=await snap(actor.userId);assert.equal(after.tableaus[actor.id].exposed.filter(Boolean).length,2);e.actions.push('opening');
 }
 if(!baseline){
  let v=await snap(f.users[0]);assert.equal(v.phase,'playing');let actor=v.players[v.turnIndex],p=pages[f.users.indexOf(actor.userId)];
  await p.locator('[data-golf-stock]:not([disabled])').tap();await p.locator('[data-golf-pending]').waitFor();
  const drawn=await snap(actor.userId),other=f.users.find(u=>u!==actor.userId);assert(drawn.pending);assert.equal((await snap(other)).pending,null);
  await p.reload();await p.locator('[data-golf-pending]').waitFor();assert.equal((await snap(actor.userId)).pending.card,drawn.pending.card);
  await p.locator('[data-golf-position="1"]').tap();await p.locator('[data-golf-pending]').waitFor({state:'hidden'});e.actions.push('stock/reload/replace');
  v=await snap(other);actor=v.players[v.turnIndex];p=pages[f.users.indexOf(actor.userId)];
  await p.locator('[data-golf-discard]:not([disabled])').tap();await p.locator('[data-golf-position="2"]:not([disabled])').tap();
  await p.waitForFunction(()=>document.querySelector('[data-golf-discard]')?.disabled===true);
  assert.equal((await snap(actor.userId)).tableaus[actor.id].exposed[2],true);e.actions.push('discard/replace');e.passed=true;
 }
 assert.deepEqual(e.errors,[]);
}catch(error){e.failure=error.stack;process.exitCode=1;}finally{writeFileSync('qualification.local/six-card-golf/interaction-'+(baseline?'before':'after')+'.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));await browser.close();}
