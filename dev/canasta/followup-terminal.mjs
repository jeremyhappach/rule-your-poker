import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {login,rpc,api,origin} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/followup-final.json','utf8')),a=await login(),e={game:f.game,match:f.dealer,passed:false};let browser;
try{
 const host=a.byUser[f.users[0]],actor=a.byUser[f.users[f.players.indexOf(f.command.playerId)]];
 const game=(await host.client.from('games').select('timer_generation').eq('id',f.game).single()).data;
 assert((await rpc(host,'request_session_end',{p_game_id:f.game,p_expected_dealer_game_id:f.dealer,p_expected_timer_generation:game.timer_generation})).request_recorded);
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);assert(executablePath);
 browser=await chromium.launch({headless:true,executablePath});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),actor.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',x=>errors.push(x.message));
 await page.goto(origin+'/game/'+f.game,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^Arrange \d+ cards$/}).waitFor({timeout:25000});
 const final=await api(actor,f.dealer,'action',f.command);assert.equal(final.status,200);assert(final.body.settlement);e.settlement=final.body.settlement;
 const replay=await api(actor,f.dealer,'action',f.command);assert.equal(replay.status,200);assert.deepEqual(replay.body.settlement,final.body.settlement);e.replay=true;
 await page.getByText('Session Ended',{exact:true}).first().waitFor({timeout:30000});
 assert.equal(await page.getByRole('button',{name:/^Arrange \d+ cards$/}).count(),0);assert.equal(await page.locator('[data-physical-id]').count(),0);
 assert.equal(await page.getByText(/wins · \d+ points/).count(),0);
 await page.screenshot({path:'qualification.local/canasta/followup-session-ended.png'});e.connectedSessionEnded=true;
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForURL(origin+'/',{timeout:15000});e.coldEndedRoutesToLobby=true;assert.deepEqual(errors,[]);e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;const page=browser?.contexts()[0]?.pages()[0];if(page){e.url=page.url();await page.screenshot({path:'qualification.local/canasta/followup-terminal-failure.png'});}}
finally{if(browser)await browser.close();await a.close();write('qualification.local/canasta/followup-terminal.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
