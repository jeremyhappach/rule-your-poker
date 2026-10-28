import assert from 'node:assert/strict';
import {writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:5213',out='qualification.local/golf-sweep-smoke';mkdirSync(out,{recursive:true});
const post=async(op,body)=>(await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)})).json();
const f=await post('new',{players:2});assert(f.id,JSON.stringify(f));
const rpc=async(user,name,args)=>{const r=await post('rpc',{user,name,args});assert(!r.error,JSON.stringify(r.error));return r.data;};
const snap=user=>rpc(user??f.user,'golf_snapshot',{p_dealer_game_id:f.id});
let v=await snap();
const move=(action,items)=>rpc(v.players[v.turnIndex].userId,'golf_action',{p_dealer_game_id:f.id,p_round_id:v.identity.roundId,p_request_id:randomUUID(),p_revision:v.revision,p_action:action,p_items:items??null});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const evidence={passed:false,errors:[],checks:[],fixture:f};
const pages=[];
try{
 for(let i=0;i<2;i++){
  const page=await browser.newPage({viewport:i?{width:1440,height:900}:{width:390,height:844},isMobile:!i,hasTouch:!i});pages.push(page);
  page.on('pageerror',e=>evidence.errors.push(e.message));await page.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
  await page.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+f.users[i]);await page.locator('[data-golf-position="0"]:enabled').waitFor();
 }
 await Promise.all(pages.map(page=>page.locator('[data-golf-position="0"]').click()));
 await Promise.all(pages.map(page=>page.locator('[data-golf-position="3"]').click()));
 await pages[0].locator('[data-golf-phase="playing"]').waitFor();v=await snap();assert.equal(v.phase,'playing');
 evidence.checks.push('phone and desktop opening selections admitted together');
 const viewer=pages.findIndex((_,i)=>f.users[i]!==v.players[v.turnIndex].userId),peer=pages[viewer];
 v=await move('draw');await peer.locator('[data-golf-pending] [data-playing-card-face]').waitFor();
 assert(await peer.locator('[data-golf-discard]').isDisabled());assert(Number(await peer.locator('[data-golf-discard]').evaluate(e=>getComputedStyle(e).opacity))<.5);
 await peer.screenshot({path:out+'/opponent-draw.png'});await peer.reload();await peer.locator('[data-golf-pending] [data-playing-card-face]').waitFor();
 evidence.checks.push('opponent sees public draw before placement and after reload; discard disabled and dimmed');
 let count=0;
 while(!(v.phase==='playing'&&v.finalQueue.length===1)){
  assert(++count<80);v=await snap(v.players[v.turnIndex].userId);
  v=await move(v.hasPending?'replace':'draw',v.hasPending?[Math.max(0,v.tableaus[v.players[v.turnIndex].id].exposed.findIndex(x=>!x))]:null);
 }
 if(!v.hasPending)v=await move('draw');
 // Reload both into the real last-turn state so prior queued motion is not the test.
 for(const page of pages){await page.reload();await page.locator('[data-golf-pending] [data-playing-card-face]').waitFor();}
 v=await move('replace',[Math.max(0,v.tableaus[v.players[v.turnIndex].id].exposed.findIndex(x=>!x))]);assert.equal(v.phase,'hole_complete');
 for(const page of pages){
  await page.locator('[data-golf-phase="hole_complete"]').waitFor();
  assert.equal(await page.locator('[data-golf-stock]:visible').count(),0);assert.equal(await page.locator('[data-golf-discard]:visible').count(),0);
 }
 evidence.checks.push('committed final action immediately hides pile controls during last-card transport');
 await pages[0].locator('[role="dialog"] [data-golf-write]').first().waitFor({timeout:60000});
 const before=await pages[0].locator('[role="dialog"] [data-golf-total]').allTextContents();assert(before.every(x=>x==='—'));
 await pages[0].screenshot({path:out+'/pencil-before-total.png'});
 await pages[0].waitForFunction(()=>document.querySelectorAll('[role="dialog"] [data-golf-total-updated]').length===2);
 const after=await pages[0].locator('[role="dialog"] [data-golf-total]').allTextContents();
 assert.deepEqual(after,v.players.map(p=>v.scores[p.id]===0?'E':String(v.scores[p.id])));
 await pages[0].screenshot({path:out+'/pencil-after-total.png'});evidence.checks.push('actual CSS pencil completion precedes each cumulative total update');
 for(const page of pages)assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 evidence.checks.push('phone 390x844 and desktop 1440x900 fit horizontally');assert.deepEqual(evidence.errors,[]);evidence.passed=true;
}catch(e){evidence.failure=e.message;for(let i=0;i<pages.length;i++){await pages[i].screenshot({path:out+'/failure-'+i+'.png'});evidence['page'+i]=await pages[i].evaluate(()=>({helper:document.querySelector('.golf-helper')?.textContent,phase:document.querySelector('[data-golf-phase]')?.getAttribute('data-golf-phase'),kind:document.querySelector('[data-golf-score-kind]')?.getAttribute('data-golf-score-kind'),dialog:document.querySelector('[role=dialog]')?.textContent,flips:document.querySelectorAll('.golf-discard-flip').length}));}throw e;}finally{write(out+'/browser-proof.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));await browser.close();}
