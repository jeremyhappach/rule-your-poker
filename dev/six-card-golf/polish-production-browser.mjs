// Publication smoke: inspect an existing paused qualification match and the
// previously completed fixture. Never submit gameplay, resume, or create a game.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {chromium} from '@playwright/test';
import {login} from '../canasta/hosted-support.mjs';
const sha=process.argv[2];assert(/^[a-f0-9]{40}$/.test(sha??''));
const origin='https://holm357.com',out='qualification.local/six-card-golf/polish-release/';
const manifest=await fetch(origin+'/build-manifest.json',{headers:{'Cache-Control':'no-cache'}}).then(r=>r.json());assert.equal(manifest.buildId,sha);
const auth=await login(),e={sha,manifest,passed:false,errors:[]};let browser;
try{
 const c=auth.clients[0],seats=await c.client.from('players').select('game_id,user_id').in('user_id',auth.clients.map(x=>x.user));assert(!seats.error);
 const ids=[...new Set(seats.data.map(p=>p.game_id))];
 const games=await c.client.from('games').select('id,current_game_uuid').in('id',ids).eq('game_type','six-card-golf').eq('status','in_progress').eq('is_paused',true).limit(10);assert(!games.error);assert(games.data.length,'No existing paused qualification match; do not fabricate one');
 const game=games.data[0],user=seats.data.find(p=>p.game_id===game.id).user_id,actor=auth.byUser[user];assert(actor);
 const snapshot=async()=>{const r=await actor.client.rpc('golf_snapshot',{p_dealer_game_id:game.current_game_uuid});assert(!r.error);return r.data;};
 const before=await snapshot();assert(before.paused);assert(['opening','playing'].includes(before.phase));
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addInitScript(s=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(s)),actor.session);
 const p=await context.newPage();p.on('pageerror',x=>e.errors.push(x.message));
 await p.goto(origin+'/game/'+game.id,{waitUntil:'domcontentloaded'});await p.locator('.golf-local').waitFor({timeout:25000});
 assert.equal(await p.locator('[data-golf-position]').count(),6);assert.equal(await p.locator('.golf-hole-flag').count(),1);assert.equal(await p.locator('.golf-leaderboard th[scope="row"]').count(),before.players.length);assert.equal(await p.locator('.golf-leaderboard thead th').count(),2);assert.equal(await p.locator('.golf-score-pill').count(),0);assert.match(await p.locator('[data-canonical-felt-plate-title]').innerText(),/GOLF/);
 e.board={session:game.id,match:game.current_game_uuid,revision:before.revision,card:await p.locator('.golf-card-artifact').first().boundingBox()};await p.screenshot({path:out+'production-board.png'});
 await p.getByRole('button',{name:'Open nine-hole scorecard'}).click();await p.locator('.golf-scorecard').waitFor();assert.equal(await p.locator('.golf-scorecard thead th').count(),11);await p.waitForTimeout(200);await p.screenshot({path:out+'production-scorecard.png'});
 await p.reload({waitUntil:'domcontentloaded'});await p.locator('.golf-local').waitFor();assert.equal(await p.locator('[data-golf-position]').count(),6);
 const after=await snapshot();assert.equal(after.revision,before.revision);assert.equal(after.paused,true);assert.deepEqual(after.tableaus,before.tableaus);e.pausedReconnectPreserved=true;
 const ended=JSON.parse(read('qualification.local/six-card-golf/forward-browser.json','utf8'));assert(ended.passed);
 await p.goto(origin+'/game/'+ended.game,{waitUntil:'domcontentloaded'});await p.waitForURL(origin+'/',{timeout:25000});assert.equal(await p.locator('[data-golf-position]').count(),0);e.endedReconnectLobby=true;
 assert.deepEqual(e.errors,[]);e.passed=true;
}finally{if(browser)await browser.close();await auth.close();write(out+'production-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
