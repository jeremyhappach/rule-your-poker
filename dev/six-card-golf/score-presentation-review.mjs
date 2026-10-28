// Isolated local authority for hole one; labelled public-card fixture for hole nine.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:5202',out='qualification.local/six-card-golf/review-20261022-v2/';
mkdirSync(out,{recursive:true});
const post=async(op,body)=>(await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)})).json();
const f=await post('new',{players:2});assert(f.id);
const rpc=async(user,name,args)=>{const r=await post('rpc',{user,name,args});assert(!r.error,r.error?.message);return r.data;};
const snap=user=>rpc(user??f.user,'golf_snapshot',{p_dealer_game_id:f.id});
let v=await snap();
const move=(action,items)=>rpc(v.players[v.turnIndex].userId,'golf_action',{p_dealer_game_id:f.id,p_round_id:v.identity.roundId,p_request_id:randomUUID(),p_revision:v.revision,p_action:action,p_items:items??null});
for(let i=0;i<2;i++)v=await move('open',[0,3]);
let commands=0;
while(!(v.phase==='playing'&&v.finalQueue.length===1)){
 assert(++commands<80);v=await snap(v.players[v.turnIndex].userId);
 v=await move(v.hasPending?'replace':'draw',v.hasPending?[Math.max(0,v.tableaus[v.players[v.turnIndex].id].exposed.findIndex(x=>!x))]:null);
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const evidence={passed:false,errors:[],frames:[],fixture:f,finalFixture:'Public completed cards reused as hole nine; actual Golf and canonical shell; no financial proof or database rewrite.'};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
 const url=base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+f.user;
 await page.goto(url);await page.locator('.golf-local').waitFor();
 if(!v.hasPending)v=await move('draw');await page.waitForTimeout(800);
 v=await move('replace',[Math.max(0,v.tableaus[v.players[v.turnIndex].id].exposed.findIndex(x=>!x))]);assert.equal(v.phase,'hole_complete');
 const frame=async(label)=>{const state=await page.evaluate(()=>({kind:document.querySelector('[data-golf-score-kind]')?.getAttribute('data-golf-score-kind'),helper:document.querySelector('.golf-helper')?.textContent,totals:[...document.querySelectorAll('.golf-leaderboard tbody td')].map(e=>e.textContent),scorecard:!!document.querySelector('[role="dialog"] .golf-scorecard'),winner:!!document.querySelector('.golf-final-scorecard'),dash:document.querySelector('[data-golf-write] path')?getComputedStyle(document.querySelector('[data-golf-write] path')).strokeDashoffset:null}));const image=label+'.png';await page.screenshot({path:out+image});evidence.frames.push({label,image,at:Date.now(),...state});return state;};
 await page.locator('[data-golf-score-kind="card"]').waitFor({timeout:30000});
 assert.deepEqual((await frame('hole-counting')).totals,['—','—']);
 await page.locator('[role="dialog"] .golf-scorecard').waitFor({timeout:40000});
 for(let i=0;i<5;i++){await frame('writing-'+i);if(i<4)await page.waitForTimeout(750);}
 assert.equal(evidence.frames.filter(x=>x.label.startsWith('writing-')).at(-1).dash,'0px');
 const sample=structuredClone(v);let final=false,started;
 sample.phase='playing';sample.settlement=null;sample.presentation=null;sample.terminal=null;sample.hole=9;sample.canAct=false;
 sample.holes=Array.from({length:8},(_,i)=>({...v.holes[0],hole:i+1,roundId:randomUUID()}));
 sample.scores=Object.fromEntries(sample.players.map(p=>[p.id,8*v.holes[0].scores[p.id]]));
 await page.route('**/__golf/rpc',async route=>{const q=route.request().postDataJSON();if(q.name!=='golf_snapshot'){await route.continue();return;}const data=structuredClone(sample);data.serverAt=Date.now();if(final){const shift=started-v.presentation.startedAt;data.phase='complete';data.revision+=2;data.presentation={...v.presentation,startedAt:v.presentation.startedAt+shift,resultsAt:v.presentation.resultsAt+shift,endsAt:v.presentation.endsAt+shift};data.holes.push({...v.holes[0],hole:9});data.settlement=Object.fromEntries(data.players.map(p=>[p.id,0]));data.scores=Object.fromEntries(data.players.map(p=>[p.id,9*v.holes[0].scores[p.id]]));const best=Math.min(...Object.values(data.scores));data.terminal={resultId:'local-public-final',winnerIds:data.players.filter(p=>data.scores[p.id]===best).map(p=>p.id),score:best,startedAt:data.presentation.endsAt,deadline:data.presentation.endsAt+60000};}await route.fulfill({json:{data,error:null,status:200}});});
 await page.addInitScript(()=>{const Native=window.EventSource;window.__golfEvents=[];window.EventSource=class extends Native{constructor(...args){super(...args);window.__golfEvents.push(this);}};});
 await page.reload();await page.locator('.golf-local').waitFor();started=Date.now();final=true;
 await page.evaluate(id=>window.__golfEvents.forEach(s=>s.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id,table:'golf_revisions',new:{dealer_game_id:id}})}))),f.id);
 await page.locator('[data-golf-score-kind="card"]').waitFor({timeout:30000});
 const counting=await frame('final-counting'),label=n=>n===0?'E':String(n);
 assert.deepEqual(counting.totals,sample.players.map(p=>label(sample.scores[p.id])));
 assert(!counting.winner);
 await page.locator('[role="dialog"] .golf-scorecard').waitFor({timeout:40000});await page.waitForTimeout(3100);
 const results=await frame('final-scorecard');assert(!results.winner);
 assert.deepEqual(results.totals,sample.players.map(p=>label(9*v.holes[0].scores[p.id])));
 await page.locator('.golf-final-scorecard').waitFor({timeout:15000});await frame('final-winner');
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;
}finally{write(out+'score-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,frames:evidence.frames.length,errors:evidence.errors}));await browser.close();}
