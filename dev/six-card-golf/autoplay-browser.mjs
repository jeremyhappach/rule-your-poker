import {chromium} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/six-card-golf/ui-context.json','utf8'));
if(!/^golf_ui_\d+$/.test(database))throw Error('Local UI database required');
const admin=await connect(database),base='http://127.0.0.1:5198';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),pages=[],errors=[];
const post=async(op,input)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(input)});const v=await r.json();if(!r.ok||v.error)throw Error(JSON.stringify(v));return v;};
try{
 const f=await post('new',{players:2});
 for(const user of f.users){
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({f})=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),{f});
  await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+user,{waitUntil:'domcontentloaded'});
  await p.getByLabel('Your six-card tableau').waitFor();
 }
 const snapshot=async user=>(await post('rpc',{user,name:'golf_snapshot',args:{p_dealer_game_id:f.id}})).data;
 const v=await snapshot(f.users[0]),actor=v.players[v.turnIndex],index=f.users.indexOf(actor.userId),self=pages[index],peer=pages[1-index];
 // Expire one exact local fixture through the normal recovery owner. The
 // browser service invokes the real SQL owner; this is not pg_cron evidence.
 await admin.query("UPDATE public.games SET timeout_enforcement_enabled=true,timeout_action='auto_fold' WHERE id=$1",[f.session]);
 await admin.query("UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=$1",[f.id]);
 const checkbox=self.getByRole('checkbox',{name:'Auto-play',exact:true});
 await checkbox.waitFor({timeout:10000});assert.equal(await checkbox.isChecked(),true);
 await peer.getByRole('img',{name:'Auto-play',exact:true}).waitFor({timeout:10000});
 let state=await snapshot(actor.userId);assert.equal(state.playerControls[actor.id].sitOutNextHand,true);
 await self.reload();await self.getByRole('checkbox',{name:'Auto-play',exact:true}).waitFor();
 assert.equal((await snapshot(actor.userId)).playerControls[actor.id].autoPlay,true);
 await self.screenshot({path:'qualification.local/six-card-golf/autoplay-self.png'});
 await peer.screenshot({path:'qualification.local/six-card-golf/autoplay-peer.png'});
 await self.getByRole('checkbox',{name:'Auto-play',exact:true}).click();
 await self.getByRole('checkbox',{name:'Auto-play',exact:true}).waitFor({state:'detached'});
 await peer.getByRole('img',{name:'Auto-play',exact:true}).waitFor({state:'detached'});
 state=await snapshot(actor.userId);assert.equal(state.playerControls[actor.id].autoPlay,false);assert.equal(state.playerControls[actor.id].sitOutNextHand,false);
 const participant=(await admin.query('SELECT auto_fold,sit_out_next_hand FROM public.players WHERE id=$1',[actor.id])).rows[0];
 assert.deepEqual(participant,{auto_fold:false,sit_out_next_hand:false});
 assert.deepEqual(errors,[]);
 writeFileSync('qualification.local/six-card-golf/autoplay-browser.json',JSON.stringify({passed:true,session:f.session,dealerGame:f.id,actor:actor.id,participant,errors}));
 console.log('PASS rendered fake timeout, checked Auto-play, peer robot beside score, reload persistence, uncheck/reclaim and deferred sit-out clear.');
}finally{await browser.close();await admin.end();}
