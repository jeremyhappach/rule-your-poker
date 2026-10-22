import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {login,rpc,api,sleep,origin} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/fresh-final-fixture.json','utf8'));
const a=await login(),e={game:f.game,match:f.dealer,passed:false};let browser;
const endSession=process.argv.includes('--end-session'),run=endSession?'terminal-race':'final-race';
try{
 const c=a.byUser[f.users[f.players.indexOf(f.command.playerId)]];assert(c);
 const prior=await api(c,f.dealer,'state');assert.equal(prior.status,200);assert(!prior.body.finished&&!prior.body.settlement);
 if(endSession){const host=a.byUser[f.users[0]],g=(await host.client.from('games').select('timer_generation').eq('id',f.game).single()).data;
  const ended=await rpc(host,'request_session_end',{p_game_id:f.game,p_expected_dealer_game_id:f.dealer,p_expected_timer_generation:g.timer_generation});assert(ended.request_recorded);e.endRequested=true;}
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);assert(executablePath);
 browser=await chromium.launch({headless:true,executablePath});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),c.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',x=>errors.push(x.message));
 await page.goto(origin+'/game/'+f.game,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^Arrange \d+ cards$/}).waitFor({timeout:25000});
 const signal='qualification.local/canasta/'+run+'-go';write('qualification.local/canasta/'+run+'-ready','ready');console.log(run+' ready');
 const until=Date.now()+90000;while(!existsSync(signal)&&Date.now()<until)await sleep(100);assert(existsSync(signal));
 await sleep(Math.max(0,Number(read(signal,'utf8'))-Date.now()));
 const commands=[f.command,{...f.command,requestId:randomUUID()}],started=Date.now();
 const results=await Promise.all(commands.map(command=>api(c,f.dealer,'action',command)));e.elapsedMs=Date.now()-started;
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert(e.elapsedMs>2500);
 const winner=results.findIndex(x=>x.status===200),final=results[winner].body;assert(final.settlement);e.resultId=final.settlement.resultId;e.batchId=final.settlement.transferBatchId;
 const retry=await api(c,f.dealer,'action',commands[winner]);assert.equal(retry.status,200);assert.deepEqual(retry.body.settlement,final.settlement);e.accepted=1;e.conflicted=1;e.replayPreservedSettlement=true;
 write('qualification.local/canasta/accepted-final.json',JSON.stringify({...f,command:commands[winner]}));
 if(endSession){await page.getByText('Session Ended',{exact:true}).first().waitFor({timeout:30000});
 assert.equal(await page.getByRole('button',{name:/^Arrange \d+ cards$/}).count(),0);assert.equal(await page.locator('[data-physical-id]').count(),0);
 await page.screenshot({path:'qualification.local/canasta/hosted-session-ended.png'});e.connectedSessionEnded=true;
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForURL(origin+'/',{timeout:15000});e.coldEndedRoutesToLobby=true;
 }else{let done;for(let i=0;i<50;i++){done=(await api(c,f.dealer,'state')).body;if(done.finished)break;await sleep(300);}assert(done.finished);const g=(await c.client.from('games').select('status').eq('id',f.game).single()).data;assert.equal(g.status,'game_selection');e.canonicalContinuation=true;await page.screenshot({path:'qualification.local/canasta/hosted-postgame.png'});}
 assert.deepEqual(errors,[]);e.errors=errors;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;
 const page=browser?.contexts()[0]?.pages()[0];if(page){e.failureUrl=page.url();e.failureVisible={arrange:await page.getByRole('button',{name:/^Arrange \d+ cards$/}).count(),sessionEnded:await page.getByText('Session Ended',{exact:true}).count()};await page.screenshot({path:'qualification.local/canasta/'+run+'-failure.png'});}
}
finally{if(browser)await browser.close();await a.close();write('dev/canasta/evidence/hosted-'+run+'.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
