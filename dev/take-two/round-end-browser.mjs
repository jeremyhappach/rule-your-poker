import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,localContext} from './database.mjs';
const dir='qualification.local/take-two/round-end';mkdirSync(dir,{recursive:true});
const db=await connect(localContext().database),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),evidence=[];
const post=async(op,body)=>{const r=await fetch('http://127.0.0.1:5187/__takeTwo/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;};
try{
 const page=await browser.newPage({viewport:{width:393,height:662}});
 await page.addInitScript(()=>{
  window.roundEvidence={audio:[],sources:[],frames:[]};
  const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(at){window.roundEvidence.sources.push({now:performance.now(),type:this.type,delay:(at-this.context.currentTime)*1000});return start.call(this,at);};
  let prior='';const frame=()=>{const result=document.querySelector('.take-result'),pill=document.querySelector('.take-total strong'),phase=result?.getAttribute('data-result-phase')??'play',value=pill?.textContent,key=phase+':'+value;if(key!==prior){window.roundEvidence.frames.push({at:Date.now(),phase,value,centered:!!document.querySelector('[data-centered=true]')});prior=key;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
 });
 // One browser session exercises Arcade → multiplayer → Arcade, then mute.
 for(const [solo,clear,muted]of [[true,true,false],[false,true,false],[true,false,false],[false,false,false],[false,true,true]]){
  const f=await post('new',{solo}),table=solo?'private.arcade_runs':'private.take_two_matches',key=solo?'id':'dealer_game_id';
  const state=(await db.query(`SELECT state FROM ${table} WHERE ${key}=$1`,[f.id])).rows[0].state,b=solo?state.board:state;
  // Seed only this newly created LOCAL fixture near a clear. The UI's final pair
  // and all result amounts/deadlines still go through the real authorized RPC.
  let pair;for(let i=0;i<b.slots.length&&!pair;i++)for(let j=i+1;j<b.slots.length;j++){const d=Math.abs(b.slots[i]%13-b.slots[j]%13);if(b.layout[i].row===b.layout[j].row&&(d<=1||d===12)){pair=[i,j];break;}}
  assert.ok(pair);if(clear)b.slots=b.slots.map((c,i)=>pair.includes(i)?c:null);
  b.phase='playing';b.deadline=Date.now()+100000;b.startedAt=Date.now();b.meterAt=Date.now();b.score=8000;
  await db.query(`UPDATE ${table} SET state=$2,revision=revision+1 WHERE ${key}=$1`,[f.id,state]);
  await page.goto('http://127.0.0.1:5187/dev/take-two/live.html?'+new URLSearchParams(f));await page.bringToFront();await page.locator('.take-bank:not([disabled])').waitFor();
  await page.evaluate(async({user,muted})=>{const {platformAudio}=await import('/src/lib/audio/platformAudio.ts');platformAudio.setPreference(user,!muted);const follow=platformAudio.follow.bind(platformAudio);platformAudio.follow=e=>{window.roundEvidence.audio.push({id:e.id,start:e.startedAt,end:e.expiresAt,at:performance.now()});return follow(e);};},{user:f.user,muted});
  if(clear){for(const i of pair){const p=b.layout[i];await page.getByRole('button',{name:new RegExp(`^Row ${p.row+1}, card ${p.column+1}:`)}).click();}}else await page.locator('.take-bank').click();
  await page.locator('.take-result').waitFor();const snapshot=await post('state',f),r=solo?snapshot.view.result:snapshot.stages.at(-1),deadline=solo?snapshot.view.deadline:snapshot.deadline;
  assert.equal(deadline-r.completedAt,6000);assert.equal(r.reason,clear?'full_clear':'take_score');
  if(clear)assert.equal(await page.locator('.take-clear-title strong').textContent(),`+${r.clearBonus.toLocaleString()}!`);
  await page.waitForFunction(total=>document.querySelector('.take-total strong')?.textContent===total.toLocaleString(),r.score);
  const finalAt=Date.now();assert.ok(finalAt<deadline,'final score before progression');
  await page.screenshot({path:`${dir}/${solo?'arcade':'multi'}-${clear?'clear':'normal'}-${muted?'muted':'sound'}-final.png`});
  await page.locator('.take-result').waitFor({state:'hidden',timeout:10000});
  const proof=await page.evaluate(()=>window.roundEvidence),counts=proof.audio.filter(e=>e.id.startsWith('take-two-count:')),clears=proof.audio.filter(e=>e.id.startsWith('take-two-clear:'));
  assert.equal(clears.length,clear?1:0);assert.equal(counts.length,1);if(clear)assert.ok(counts[0].start>=clears[0].end);
  assert.ok(proof.frames.filter(x=>x.phase==='score').every(x=>Number(x.value.replaceAll(',',''))<=r.score),'never doubles clear bonus');
  if(muted)assert.equal(proof.sources.length,0);else assert.ok(proof.sources.length>0);
  evidence.push({mode:solo?'Arcade':'multiplayer',clear,muted,result:r,deadline,finalAt,...proof});
 }
 writeFileSync(`${dir}/browser.json`,JSON.stringify(evidence,null,2));console.log('Five authoritative result timelines passed, audible/muted sources and Arcade/multiplayer mode switches verified');
}finally{await browser.close();await db.end();}
