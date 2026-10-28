// Render public snapshots exported by the rollback proof; never apply the candidate.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:5202',out='qualification.local/six-card-golf/review-20261022-v2/';
const frames=JSON.parse(read(out+'threshold-public-frames.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),results=[];
try{for(const {label,snapshot}of frames){
 const viewer=snapshot.players.find(p=>p.id===snapshot.viewerId),f={id:snapshot.identity.dealerGameId,session:snapshot.identity.sessionId,user:viewer.userId,players:snapshot.players.map(p=>({id:p.id,user:p.userId,seat:p.seat}))};
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
 await page.route('**/__golf/rpc',async route=>{const q=route.request().postDataJSON();assert.equal(q.name,'golf_snapshot','review must not submit an action');const data=structuredClone(snapshot),shift=Date.now()-data.serverAt;data.serverAt+=shift;data.deadline+=shift;await route.fulfill({json:{data,error:null,status:200}});});
 await page.route('**/__golf/read',async route=>{const q=route.request().postDataJSON();let data=[];if(q.table==='players')data=snapshot.players.map(p=>({id:p.id,game_id:f.session,user_id:p.userId,position:p.seat,chips:p.chips,is_bot:p.isBot,status:'active'}));if(q.table==='profiles')data=snapshot.players.map(p=>({id:p.userId,username:p.name}));await route.fulfill({json:{data:q.single?data[0]??null:data,error:null}});});
 await page.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+viewer.userId);await page.locator('.golf-local').waitFor();
 await page.waitForTimeout(350);const helper=await page.locator('.golf-helper').textContent();
 if(label==='threshold-pending')assert(helper.includes('Finish this turn'));
 else assert.equal(await page.locator('.golf-final-turn').textContent(),'FINAL TURN');
 await page.screenshot({path:out+label+'.png'});results.push({label,helper,version:snapshot.rules.version,stock:snapshot.stockCount,queue:snapshot.finalQueue});await page.close();
}write(out+'threshold-visual-proof.json',JSON.stringify({passed:true,publicRollbackSnapshots:true,results},null,2));console.log('PASS /2 pending warning and persistent final-turn queue');}finally{await browser.close();}
