// Local isolated authority for actions; explicitly labelled final-hole public fixture.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:5202',out='qualification.local/six-card-golf/review-20261022-smoke/';mkdirSync(out,{recursive:true});
const post=async(op,body)=>(await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)})).json();
const f=await post('new',{players:2});assert(f.id,JSON.stringify(f));
const rpc=async(user,name,args)=>{const r=await post('rpc',{user,name,args});assert(!r.error,r.error?.message);return r.data;};
const snap=user=>rpc(user??f.user,'golf_snapshot',{p_dealer_game_id:f.id});
let v=await snap();
const move=async(action,items)=>rpc(v.players[v.turnIndex].userId,'golf_action',{p_dealer_game_id:f.id,p_round_id:v.identity.roundId,p_request_id:randomUUID(),p_revision:v.revision,p_action:action,p_items:items??null});
for(let i=0;i<2;i++)v=await move('open',[0,3]);
const viewer=v.players[v.turnIndex].userId;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),e={passed:false,errors:[],frames:[],fixture:f};
try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',x=>e.errors.push(x.message));await p.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
 const url=base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+viewer;
 await p.goto(url);await p.locator('[data-golf-stock]:not([disabled])').click();await p.locator('[data-golf-reject]').waitFor();await p.screenshot({path:out+'discard-pill.png'});
 const drawn=await snap(viewer);await p.locator('[data-golf-pending]').click({force:true});await p.waitForTimeout(150);assert.equal((await snap(viewer)).revision,drawn.revision,'Card itself must not discard');
 await p.locator('[data-golf-reject]').click();await p.waitForTimeout(1800);assert.equal(await p.locator('[data-golf-reject]').count(),0);
 for(const [width,height]of [[390,844],[844,390]]){await p.setViewportSize({width,height});await p.waitForTimeout(250);await p.screenshot({path:out+'opponent-'+width+'.png'});}
 await p.setViewportSize({width:390,height:844});
 // Legal local commands prepare the final turn, without modifying private cards.
 v=await snap();let commands=0;
 while(!(v.phase==='playing'&&v.finalQueue.length===1)){
  assert(++commands<80);v=await snap(v.players[v.turnIndex].userId);
  v=await move(v.hasPending?'replace':'draw',v.hasPending?[Math.max(0,v.tableaus[v.players[v.turnIndex].id].exposed.findIndex(x=>!x))]:null);
 }
 await p.reload();await p.locator('.golf-local').waitFor();
 if(!v.hasPending)v=await move('draw');
 await p.waitForTimeout(800);v=await move('replace',[Math.max(0,v.tableaus[v.players[v.turnIndex].id].exposed.findIndex(x=>!x))]);assert.equal(v.phase,'hole_complete');
 const capture=async(label)=>{let last='',until=Date.now()+90000;while(Date.now()<until){const s=await p.evaluate(()=>({kind:document.querySelector('[data-golf-score-kind]')?.getAttribute('data-golf-score-kind')??null,step:document.querySelector('[data-golf-score-step]')?.getAttribute('data-golf-score-step')??null,scorecard:!!document.querySelector('[role="dialog"] .golf-scorecard'),winner:!!document.querySelector('.golf-final-scorecard'),flights:document.querySelectorAll('[data-card-transport-flying]').length}));const key=JSON.stringify(s);if(key!==last){const image=label+'-'+e.frames.length+'.png';await p.screenshot({path:out+image});e.frames.push({...s,image,at:Date.now(),label});last=key;}if(s.scorecard){await p.screenshot({path:out+label+'-scorecard.png'});return;}await p.waitForTimeout(100);}throw Error('Scorecard timeout');};
 await capture('hole');assert(!e.frames.some(x=>x.winner));
 // Reuse only public, completed-hole values for a clearly labelled final fixture.
 const sample=structuredClone(v);let final=false,started;
 sample.phase='playing';sample.settlement=null;sample.presentation=null;sample.terminal=null;sample.hole=9;sample.canAct=false;sample.holes=Array.from({length:8},(_,i)=>({...v.holes[0],hole:i+1,roundId:randomUUID()}));sample.scores=Object.fromEntries(sample.players.map(x=>[x.id,8*v.holes[0].scores[x.id]]));
 await p.route('**/__golf/rpc',async route=>{const q=route.request().postDataJSON();if(q.name!=='golf_snapshot'){await route.continue();return;}const data=structuredClone(sample);data.serverAt=Date.now();if(final){const shift=started-v.presentation.startedAt;data.phase='complete';data.revision+=2;data.presentation={...v.presentation,startedAt:v.presentation.startedAt+shift,resultsAt:v.presentation.resultsAt+shift,endsAt:v.presentation.endsAt+shift};data.holes.push({...v.holes[0],hole:9});data.settlement=Object.fromEntries(data.players.map(x=>[x.id,0]));data.scores=Object.fromEntries(data.players.map(x=>[x.id,9*v.holes[0].scores[x.id]]));const best=Math.min(...Object.values(data.scores));data.terminal={resultId:'local-public-final',winnerIds:data.players.filter(x=>data.scores[x.id]===best).map(x=>x.id),score:best,startedAt:data.presentation.endsAt,deadline:data.presentation.endsAt+60000};}await route.fulfill({json:{data,error:null,status:200}});});
 await p.addInitScript(()=>{const Native=window.EventSource;window.__golfEvents=[];window.EventSource=class extends Native{constructor(...args){super(...args);window.__golfEvents.push(this);}};});
 await p.reload();await p.locator('.golf-local').waitFor();started=Date.now();final=true;
 await p.evaluate(id=>window.__golfEvents.forEach(s=>s.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id,table:'golf_revisions',new:{dealer_game_id:id}})}))),f.id);
 await capture('final');assert(!e.frames.filter(x=>x.label==='final').some(x=>x.winner));
 await p.locator('.golf-final-scorecard').waitFor({timeout:15000});await p.screenshot({path:out+'final-winner.png'});
 e.finalFixture='Public completed cards reused as hole nine; actual Golf and canonical shell, no financial proof or database rewrite';
 assert.deepEqual(e.errors,[]);e.passed=true;
}finally{write(out+'evidence.json',JSON.stringify(e,null,2));console.log(JSON.stringify({passed:e.passed,frames:e.frames.length,errors:e.errors}));await browser.close();}
