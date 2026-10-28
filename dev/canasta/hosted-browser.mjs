import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {login,rpc,api,sleep,origin} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const old=JSON.parse(read('qualification.local/canasta/final-fixture.json','utf8'));
const target=JSON.parse(read('qualification.local/canasta/browser-session.json','utf8'));
const auth=await login(),e={game:target.game,passed:false,layouts:[]};let browser;
try{
 const db=auth.clients[0].client;
 const game=(await db.from('games').select('status,dealer_position,config_deadline,is_paused,current_game_uuid').eq('id',target.game).single()).data;
 assert(game&&!game.is_paused);
 const seats=(await db.from('players').select('id,user_id,position').eq('game_id',target.game).in('id',target.players)).data;
 const caller=seats.find(p=>p.position===game.dealer_position),peer=seats.find(p=>p.id!==caller.id);assert(caller&&peer);
 const resumed=process.argv.includes('--resume-existing');
 const retained=resumed?JSON.parse(read('qualification.local/canasta/browser-match.json','utf8')):null;
 if(resumed){assert.equal(retained.game,target.game);assert.equal(retained.dealer,game.current_game_uuid);assert(JSON.parse(read('dev/canasta/evidence/hosted-browser.json','utf8')).freshConsent);}
 else assert.equal(game.status,'game_selection');
 const setup=resumed?null:await rpc(auth.byUser[caller.user_id],'canasta_configure',{p_game_id:target.game,p_dealer_player_id:caller.id,p_expected_dealer_position:game.dealer_position,p_game_type:'canasta',p_config:{ante_amount:5},p_expected_config_deadline:game.config_deadline});
 const match=resumed?retained.dealer:setup.dealer_game.id;e.match=match;assert.notEqual(match,old.dealer);
 write('qualification.local/canasta/browser-match.json',JSON.stringify({...target,dealer:match}));
 if(!resumed){assert.notEqual((await api(auth.byUser[caller.user_id],match,'state')).status,200,'No match before fresh consent');
 await rpc(auth.byUser[peer.user_id],'submit_ante_decision',{p_game_id:target.game,p_expected_dealer_game_id:match,p_player_id:peer.id,p_decision:'ante_up',p_auto_ante:null,p_auto_ante_runback:null});}
 e.freshConsent=true;
 let first;for(let i=0;i<50;i++){first=await api(auth.clients[0],match,'state');if(first.status===200&&first.body.state.hand)break;await sleep(300);}
 assert(first.status===200&&first.body.state.hand);const active=first.body.state.hand.active,actor=seats.find(p=>p.id===active),c=auth.byUser[actor.user_id];
 const before=await api(c,match,'state');assert.equal(before.body.state.hand.number,1);
 for(const person of auth.clients){const v=(await api(person,match,'state')).body.state;assert(v.hand.players[v.viewer].cards);assert(!v.hand.players[seats.find(s=>s.id!==v.viewer).id].cards);assert(!v.hand.stock);}
 e.privateProjection=true;
 const oldActor=auth.byUser[old.users[old.players.indexOf(old.command.playerId)]];const replay=await api(oldActor,old.dealer,'action',old.command);assert([200,403].includes(replay.status));e.retiredActorReplayStatus=replay.status;
 const after=(await api(c,match,'state')).body;assert.equal(after.state.revision,before.body.state.revision);e.oldReplayPreservesNewMatch=true;
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);assert(executablePath);
 browser=await chromium.launch({headless:true,executablePath});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),c.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',x=>errors.push(x.message));
 await page.goto(origin+'/game/'+target.game,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/^Arrange \d+ cards$/}).click({timeout:25000});
 await page.getByRole('button',{name:'Finish',exact:true}).click();
 const drawn=page.waitForResponse(r=>r.url().endsWith('/'+match+'/action')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Draw two',exact:true}).click();assert.equal((await drawn).status(),200);
 const committed=(await api(c,match,'state')).body;assert.equal(committed.state.hand.phase,'meld');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^Arrange \d+ cards$/}).click();
 assert.equal((await api(c,match,'state')).body.state.revision,committed.state.revision);e.reconnectPreservesDraw=true;
 for(const [width,height]of[[320,568],[430,932],[932,430]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  const boxes=await page.locator('[data-physical-id]').evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert(boxes.length&&boxes.every(b=>b.w>=44&&b.h>=44&&b.x>=0&&b.y>=0&&b.x+b.w<=width+1&&b.y+b.h<=height+1));
  await page.screenshot({path:`qualification.local/canasta/hosted-${width}x${height}.png`});e.layouts.push({width,height,targets:boxes.length});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('[data-physical-id]').first().click();await page.getByRole('button',{name:'Discard',exact:true}).click();
 const finished=page.waitForResponse(r=>r.url().endsWith('/'+match+'/action')&&r.request().method()==='POST');await page.getByRole('button',{name:'Submit turn',exact:true}).click();assert.equal((await finished).status(),200);
 const end=(await api(c,match,'state')).body;assert.notEqual(end.state.hand.active,active);e.visibleTurnSubmitted=true;assert.deepEqual(errors,[]);
 write('qualification.local/canasta/browser-match.json',JSON.stringify({...target,dealer:match,first:end.firstRoundId,revision:end.state.revision}));
 const g=(await db.from('games').select('pause_version').eq('id',target.game).single()).data;
 await rpc(auth.byUser[old.users[0]],'set_game_paused',{p_game_id:target.game,p_paused:true,p_expected_dealer_game_id:match,p_expected_pause_version:g.pause_version});
 e.retainedPaused=true;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{if(browser)await browser.close();await auth.close();write('dev/canasta/evidence/hosted-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
