import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,localContext} from './database.mjs';
const base='http://127.0.0.1:5199',db=await connect(localContext().database),browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)}),checks=[],errors=[];
const until=async(fn,label)=>{const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(label);};
try{for(const real of [false,true]){
 const f=await(await fetch(base+'/__battle31_route/new',{method:'POST',body:JSON.stringify({real})})).json(),pages=[];
 for(const token of f.tokens){const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await p.goto(base+'/game/'+f.game+'?token='+token,{waitUntil:'commit'});pages.push(p);}
 const [caller,other]=pages;await caller.getByRole('tab',{name:'Other',exact:true}).click();await caller.getByRole('button',{name:/Battle 31/}).click();await caller.getByRole('button',{name:'Start Battle 31',exact:true}).click();await other.getByRole('button',{name:/Ante Up!/}).click();for(const p of pages)await p.locator('[data-battle31]').waitFor();
 const game=async()=>(await db.query('SELECT * FROM public.games WHERE id=$1',[f.game])).rows[0];const id=(await game()).current_game_uuid;
 const match=async()=>(await db.query('SELECT * FROM private.battle31_matches WHERE dealer_game_id=$1',[id])).rows[0];
 await db.query("UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','playing','turn',1,'turnIndex',0,'closing',false,'hands','[[0,1,10],[16,17,26]]'::jsonb,'center','[2,11,20]'::jsonb,'deadline',0),revision=revision+1 WHERE dealer_game_id=$1",[id]);
 const m=await match(),actorIndex=f.users.indexOf(m.state.players[0].userId),actor=pages[actorIndex],opponent=pages[1-actorIndex],playerId=m.state.players[0].id;
 const flags=async()=>(await db.query('SELECT auto_fold,sit_out_next_hand FROM public.players WHERE id=$1',[playerId])).rows[0];
 if(real){await until(async()=>(await game()).is_paused,'real-money pause');assert.deepEqual(await flags(),{auto_fold:false,sit_out_next_hand:false});await actor.reload({waitUntil:'commit'});await actor.locator('.battle-clock').filter({hasText:'Paused'}).waitFor();assert.equal(await actor.getByRole('checkbox',{name:'Auto-play'}).isChecked(),false);assert.deepEqual((await match()).state.hands,m.state.hands);await caller.bringToFront();await caller.getByRole('button',{name:'Player options',exact:true}).click();await caller.getByRole('menuitem',{name:/Resume Game/}).click();await until(async()=>!(await game()).is_paused,'host resume');assert((await match()).state.deadline>Date.now()+13000);checks.push('real-money timeout visibly pauses; reconnect preserves hand, no autoplay or sit-out; canonical host menu resumes with full deadline');}
 else {
  await until(async()=>(await flags()).auto_fold,'fake-money autoplay');await until(()=>actor.getByRole('checkbox',{name:'Auto-play'}).isChecked(),'checkbox checked');await opponent.locator('.battle-other .battle-score [role="img"]').waitFor();
  await actor.reload({waitUntil:'commit'});await until(()=>actor.getByRole('checkbox',{name:'Auto-play'}).isChecked(),'reconnected checkbox');
  await opponent.screenshot({path:'qualification.local/battle31/timeout-opponent-portrait.png'});await opponent.setViewportSize({width:667,height:375});await opponent.screenshot({path:'qualification.local/battle31/timeout-opponent-landscape.png'});
  await actor.bringToFront();await actor.getByRole('checkbox',{name:'Auto-play'}).click();await until(async()=>{const p=await flags();return !p.auto_fold&&!p.sit_out_next_hand;},'reclaim flags');await until(async()=>await opponent.locator('.battle-other .battle-score [role="img"]').count()===0,'robot removed');
  assert.equal(await actor.getByRole('checkbox',{name:'Auto-play'}).isChecked(),false);checks.push('fake-money autoplay, opponent robot beside score, reload persistence, checkbox reclaim and both flags cleared');
 }
 await db.query('UPDATE public.games SET is_paused=true WHERE id=$1',[f.game]);for(const p of pages)await p.close();
}
assert.deepEqual(errors,[]);writeFileSync('dev/battle31/evidence/timeout-browser.json',JSON.stringify({at:new Date().toISOString(),database:localContext().database,checks,errors},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser.close();await db.end();}
