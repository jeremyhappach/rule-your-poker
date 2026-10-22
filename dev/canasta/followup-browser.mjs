import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {login,rpc,api,sleep,origin} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/followup-session.json','utf8'));
const expected='cf759114f75e31b2d2541f13dd24dff5f15e64a3';
assert.equal((await fetch(origin+'/build-manifest.json',{cache:'no-store'}).then(r=>r.json())).buildId,expected);
const a=await login(),e={game:f.game,sha:expected,passed:false};let browser;
try{
 const host=a.byUser[f.users[0]],peer=a.byUser[f.users[1]];
 const g=(await host.client.from('games').select('config_deadline,status,current_game_uuid').eq('id',f.game).single()).data;
 const resumed=g.status==='in_progress';assert(resumed||g.status==='game_selection');
 const setup=resumed?null:await rpc(host,'canasta_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:4,p_game_type:'canasta',p_config:{ante_amount:5},p_expected_config_deadline:g.config_deadline});
 const match=resumed?g.current_game_uuid:setup.dealer_game.id;e.match=match;
 if(!resumed){assert.equal(setup.dealer_game.config.experience.turnMs,180000);
 assert.notEqual((await api(host,match,'state')).status,200);
 await rpc(peer,'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:match,p_player_id:f.players[1],p_decision:'ante_up',p_auto_ante:null,p_auto_ante_runback:null});}
 let v;for(let i=0;i<40;i++){v=(await api(host,match,'state')).body;if(v.state?.hand)break;await sleep(500);}assert(v.state?.hand);e.freshConsent=true;
 const c=a.byUser[f.users[f.players.indexOf(v.state.hand.active)]],before=(await api(c,match,'state')).body;
 assert.deepEqual(before.state.config,{mode:'beginner',turnMs:180000,timeoutPolicy:'complete-match'});
 assert(!before.state.hand.stock&&before.state.hand.pile.length<=1);assert.equal(Object.values(before.state.hand.players).filter(p=>p.cards).length,1);e.privateProjection=true;
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);assert(executablePath);
 browser=await chromium.launch({headless:true,executablePath});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),c.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',x=>errors.push(x.message));
 await page.goto(origin+'/game/'+f.game,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/^Arrange \d+ cards$/}).click({timeout:25000});
 await page.getByRole('button',{name:'Finish',exact:true}).click();
 const [drawn]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/'+match+'/action')&&r.request().method()==='POST'),page.getByRole('button',{name:'Draw two',exact:true}).click()]);assert.equal(drawn.status(),200);
 const committed=(await api(c,match,'state')).body;assert.equal(committed.state.hand.phase,'meld');assert.equal(committed.state.hand.deadline,before.state.hand.deadline);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^Arrange \d+ cards$/}).click();assert.equal((await api(c,match,'state')).body.state.revision,committed.state.revision);e.reconnect=true;
 await page.locator('[data-physical-id]').first().click();await page.getByRole('button',{name:'Discard',exact:true}).click();
 const [submitted]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/'+match+'/action')&&r.request().method()==='POST'),page.getByRole('button',{name:'Submit turn',exact:true}).click()]);assert.equal(submitted.status(),200);
 const after=(await api(c,match,'state')).body;assert.notEqual(after.state.hand.active,before.state.hand.active);assert.deepEqual(errors,[]);e.browserTurn=true;
 await page.screenshot({path:'qualification.local/canasta/followup-turn.png'});
 const game=(await host.client.from('games').select('pause_version').eq('id',f.game).single()).data;
 await rpc(host,'set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:match,p_expected_pause_version:game.pause_version});
 const paused=(await api(host,match,'state')).body;
 write('qualification.local/canasta/followup-match.json',JSON.stringify({...f,dealer:match,first:paused.firstRoundId,revision:paused.state.revision,config:paused.state.config}));e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;const page=browser?.contexts()[0]?.pages()[0];if(page){e.url=page.url();await page.screenshot({path:'qualification.local/canasta/followup-browser-failure.png'});}}
finally{if(browser)await browser.close();await a.close();write('qualification.local/canasta/followup-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
