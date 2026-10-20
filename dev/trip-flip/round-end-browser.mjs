import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,localContext} from './database.mjs';
const dir='qualification.local/trip-flip/polish';mkdirSync(dir,{recursive:true});
const db=await connect(localContext().database),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),evidence=[],seeded=[];
const post=async(op,body)=>{const r=await fetch('http://127.0.0.1:5191/__tripFlip/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;};
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{
  window.roundEvidence={audio:[],sources:[],frames:[]};
  const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(at){window.roundEvidence.sources.push({now:performance.now(),type:this.type,delay:(at-this.context.currentTime)*1000});return start.call(this,at);};
  let prior='';const frame=()=>{const result=document.querySelector('.trip-round-result'),pill=document.querySelector('.trip-score[data-active=true] b'),phase=result?'result':'play',value=pill?.textContent,key=phase+':'+value;if(key!==prior){window.roundEvidence.frames.push({at:Date.now(),phase,value,centered:!!document.querySelector('.trip-score[data-centered=true]')});prior=key;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
 });
 for(const [solo,muted] of [[true,false],[false,false],[true,true]]){
  const f=await post('new',{solo}),table=solo?'private.arcade_runs':'private.trip_flip_matches',key=solo?'id':'dealer_game_id';
  seeded.push({id:f.id,solo});
  const state=(await db.query('SELECT state FROM '+table+' WHERE '+key+'=$1',[f.id])).rows[0].state,b=solo?state.board:state;
  Object.assign(b,{phase:'playing',deadline:Date.now()+180000,startedAt:Date.now(),scoreBefore:7450,score:13650,trips:0,runs:2,suitedTotal:5000,specialTotal:0});
  await db.query('UPDATE '+table+' SET state=$2,revision=revision+1 WHERE '+key+'=$1',[f.id,state]);
  await page.goto('http://127.0.0.1:5191/dev/trip-flip/live.html?'+new URLSearchParams(f));await page.bringToFront();await page.locator('.trip-bank:not([disabled])').waitFor();
  await page.evaluate(async({user,muted})=>{const {platformAudio}=await import('/src/lib/audio/platformAudio.ts');platformAudio.setPreference(user,!muted);const follow=platformAudio.follow.bind(platformAudio);platformAudio.follow=e=>{window.roundEvidence.audio.push({id:e.id,start:e.startedAt,end:e.expiresAt,at:performance.now()});return follow(e);};},{user:f.user,muted});
  const opponent=solo?null:await page.locator('.trip-score[data-active=false] b').textContent();
  await page.locator('.trip-bank').click();await page.locator('.trip-round-result').waitFor();
  const snapshot=await post('state',f),r=solo?snapshot.view.result:snapshot.stages.at(-1),deadline=solo?snapshot.view.deadline:snapshot.deadline;
  assert.equal(deadline-r.completedAt,6000);assert.equal(r.scoreBefore,7450);
  await page.waitForTimeout(1700);
  const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};};return{pill:rect(document.querySelector('.trip-score[data-active=true]')),viewport:rect(document.querySelector('.trip-plane'))};});
  assert.ok(Math.abs(geometry.pill.x-geometry.viewport.x)<1&&Math.abs(geometry.pill.y-geometry.viewport.y)<1,'true gameplay center');
  if(!solo)assert.equal(await page.locator('.trip-score[data-active=false] b').textContent(),opponent);
  assert.equal(await page.locator('.trip-round-result p').count(),0);
  await page.screenshot({path:dir+'/'+(solo?'arcade':'multi')+'-'+(muted?'muted':'sound')+'-count.png'});
  await page.waitForFunction(total=>document.querySelector('.trip-score[data-active=true] b')?.textContent===total.toLocaleString(),r.score);
  assert.ok(Date.now()<deadline);
  const proof=await page.evaluate(()=>window.roundEvidence),counts=proof.audio.filter(e=>e.id.includes('-count:'));
  assert.equal(counts.length,1);assert.equal(Math.round(counts[0].end-counts[0].start),2800);
  assert.ok(proof.frames.filter(x=>x.phase==='result').every(x=>Number(x.value.replaceAll(',',''))>=7450&&Number(x.value.replaceAll(',',''))<=r.score));
  if(muted)assert.equal(proof.sources.length,0);else assert.ok(proof.sources.length>0);
  await page.reload();await page.locator('.trip-round-result').waitFor();
  assert.equal(await page.locator('.trip-score[data-active=true] b').textContent(),r.score.toLocaleString());
  assert.equal(await page.locator('.trip-score[data-centered=true]').count(),0);
  assert.equal((solo?(await post('state',f)).view:await post('state',f)).deadline,deadline);
  const recovered=await page.evaluate(()=>window.roundEvidence);assert.equal(recovered.sources.length,0,'reconnect does not replay result audio');
  await page.locator('.trip-round-result').waitFor({state:'hidden',timeout:8000});
  evidence.push({mode:solo?'Arcade':'multiplayer',muted,result:r,deadline,geometry,...proof});
 }
 writeFileSync(dir+'/round-end-browser.json',JSON.stringify(evidence,null,2));
 console.log('PASS both-mode authoritative cumulative count-up, true-center pill/opponent retention, synchronized sound/mute, reload seek without replay, unchanged 6s deadline');
}finally{
 await browser.close();
 // Presentation fixtures seed cumulative totals without a complete earlier-round
 // history. Retire these local-only fixtures before background finalization.
 for(const f of seeded)await db.query(f.solo?"UPDATE private.arcade_runs SET status='abandoned',due_at=NULL WHERE id=$1 AND status='active'":"UPDATE private.trip_flip_matches SET finished=true WHERE dealer_game_id=$1",[f.id]);
 await db.end();
}
