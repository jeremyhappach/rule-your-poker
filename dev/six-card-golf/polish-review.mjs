import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5202',out='qualification.local/six-card-golf/review-20261022-polish/';
mkdirSync(out,{recursive:true});
const evidence={passed:false,errors:[],layouts:[],motion:[],samples:'Scorecard history and game-over screenshots use labelled browser-only public result fixtures. Live board and replacement use actual loopback authority.'};
const post=async(op,body)=>(await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)})).json();
const rpc=async(user,name,args)=>{const r=await post('rpc',{user,name,args});assert.equal(r.error,null,JSON.stringify(r));return r.data;};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const f=await post('new',{players:4});assert(f.id,JSON.stringify(f));
 let v=await rpc(f.user,'golf_snapshot',{p_dealer_game_id:f.id});
 for(let i=0;i<4;i++)v=await rpc(v.players[v.turnIndex].userId,'golf_action',{p_dealer_game_id:f.id,p_round_id:v.identity.roundId,p_request_id:randomUUID(),p_revision:v.revision,p_action:'open',p_items:[0,3]});
 const user=v.players[v.turnIndex].userId;v=await rpc(user,'golf_snapshot',{p_dealer_game_id:f.id});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',x=>evidence.errors.push(x.message));
 await p.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
 const url=base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+user;
 await p.goto(url);await p.locator('[data-golf-stock]:not([disabled])').waitFor();
 assert.equal(await p.locator('.golf-score-pill').count(),0);assert.match(await p.locator('[data-canonical-felt-plate-title]').innerText(),/\$5 GOLF/);
 assert.equal(await p.locator('.golf-leaderboard tbody td:nth-child(2)').first().innerText(),'—');
 await p.screenshot({path:out+'board.png'});
 await p.locator('[data-golf-stock]').click();await p.locator('[data-golf-pending]:not([disabled])').waitFor();await p.screenshot({path:out+'draw.png'});
 await p.locator('[data-golf-position="1"]').click();
 for(let i=0;i<12;i++){const state=await p.evaluate(()=>({stage:document.querySelector('[data-golf-displaced]')?.getAttribute('data-golf-displaced')??(document.querySelector('.golf-discard-flip')?'flip':'idle'),flights:[...document.querySelectorAll('[data-card-transport-flying]')].map(x=>({id:x.getAttribute('data-card-transport-intent'),face:x.getAttribute('data-card-transport-face')})),slots:document.querySelectorAll('[data-golf-position]').length}));evidence.motion.push({...state,image:'motion-'+i+'.png',at:Date.now()});await p.screenshot({path:out+'motion-'+i+'.png'});await p.waitForTimeout(65);}
 assert(evidence.motion.some(x=>x.stage==='incoming'));assert(evidence.motion.some(x=>x.stage==='outgoing'));assert(evidence.motion.every(x=>x.slots===6));
 await p.screenshot({path:out+'opponent.png'});
 assert.equal(await p.locator('[data-golf-discard]').isDisabled(),true);assert.equal(await p.locator('[data-golf-discard]').evaluate(x=>getComputedStyle(x).opacity),'0.38');
 // Browser-only public sample: completed results, no hidden-card access or DB changes.
 let sample=structuredClone(v);sample.hole=4;sample.revision+=100;sample.deadline=Date.now()+600000;sample.serverAt=Date.now();
 sample.holes=Array.from({length:3},(_,i)=>({hole:i+1,roundId:randomUUID(),scores:Object.fromEntries(sample.players.map((player,j)=>[player.id,[0,-2,7,12][(i+j)%4]]))}));
 sample.scores=Object.fromEntries(sample.players.map(player=>[player.id,sample.holes.reduce((sum,h)=>sum+h.scores[player.id],0)]));
 await p.route('**/__golf/rpc',async route=>{const req=route.request().postDataJSON();if(req.name==='golf_snapshot')await route.fulfill({json:{data:{...sample,serverAt:Date.now()},error:null,status:200}});else await route.continue();});
 await p.reload();await p.locator('.golf-leaderboard').waitFor();await p.screenshot({path:out+'standings.png'});
 await p.locator('.golf-leaderboard').click();await p.locator('.golf-scorecard').waitFor();await p.waitForTimeout(250);await p.screenshot({path:out+'scorecard.png'});
 assert.equal(await p.locator('.golf-scorecard thead th').count(),11);assert.equal(await p.locator('.golf-scorecard tbody tr').count(),4);assert.equal(await p.locator('.golf-scorecard tbody tr:first-child td:nth-child(5)').innerText(),'');
 await p.getByRole('button',{name:'Close',exact:true}).click();
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1024,height:768}]){
  await p.setViewportSize(viewport);await p.waitForTimeout(120);
  const boxes=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {hand:rect('.golf-local'),pane:rect('.golf-hand-row'),flag:rect('.golf-hole-flag'),leader:rect('.golf-leaderboard'),stock:rect('[data-card-anchor="stock"]'),discard:rect('[data-card-anchor="discard"]')};});
  assert(Math.abs(boxes.hand.x+boxes.hand.w/2-(boxes.pane.x+boxes.pane.w/2))<2,JSON.stringify(boxes));assert(boxes.flag.x+boxes.flag.w<=boxes.hand.x+2);assert(boxes.hand.x+boxes.hand.w<=boxes.leader.x+2);assert(boxes.discard.x<boxes.stock.x);assert(boxes.stock.w>0);assert(boxes.hand.y>=boxes.pane.y-1);assert(boxes.hand.y+boxes.hand.h<=boxes.pane.y+boxes.pane.h+1);
  evidence.layouts.push({viewport,boxes});await p.screenshot({path:out+'layout-'+viewport.width+'.png'});
 }
 await p.setViewportSize({width:390,height:844});
 sample={...sample,phase:'complete',hole:9,canAct:false,settlement:Object.fromEntries(sample.players.map(player=>[player.id,0])),presentation:{version:1,startedAt:Date.now()-120000,resultsAt:Date.now()-6000,endsAt:Date.now()-1000,hidden:{}},terminal:{resultId:randomUUID(),winnerIds:sample.players.map(player=>player.id),score:18,startedAt:Date.now()-1000,deadline:Date.now()+600000}};
 sample.holes=Array.from({length:9},(_,i)=>({hole:i+1,roundId:randomUUID(),scores:Object.fromEntries(sample.players.map(player=>[player.id,2]))}));sample.scores=Object.fromEntries(sample.players.map(player=>[player.id,18]));
 await p.reload();await p.locator('.golf-final-scorecard').waitFor();await p.screenshot({path:out+'game-over.png'});assert.equal(await p.locator('[data-golf-stock]').count(),0);
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;
}catch(e){evidence.failure=e.stack;process.exitCode=1;}finally{writeFileSync(out+'polish-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));await browser.close();}
