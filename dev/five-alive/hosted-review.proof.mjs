// Isolated Auth/PostgREST/Realtime + actual Delayed route and Five Alive API.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {traceFiveAliveReview} from './presentation/review-trace.mjs';
import {closeWordResults} from './presentation/acceptance.mjs';
const dir='qualification.local/five-alive/hosted',fixture=JSON.parse(await readFile(dir+'/trace-fixture.json','utf8'));
const config=JSON.parse(await readFile(dir+'/browser.public.json','utf8')),accounts=JSON.parse(await readFile(dir+'/accounts.private.json','utf8'));
assert.equal(config.url,'https://tyuxxkalhqbqkbvvkcfx.supabase.co');assert.equal(fixture.realMoney,false);
const fullApp=process.argv.includes('--full-app'),round=Number(process.argv.find(a=>a.startsWith('--round='))?.split('=')[1]??1);
const origin=process.env.FIVE_ALIVE_TEST_ORIGIN??'http://127.0.0.1:5210',evidence={origin,fullApp,round,fixture:{match:fixture.match,child:fixture.child},errors:[],forbidden:[],guesses:[]},actors=[];
assert.ok(['http://127.0.0.1:5210','http://127.0.0.1:5211'].includes(origin));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const route='/delayed/'+fixture.match+'/'+fixture.child,url=fullApp?origin+'/delayed/'+fixture.match+'/play/'+fixture.child:origin+'/dev/five-alive/hosted-lobby.html?route='+encodeURIComponent(route);
async function open(index){
 const auth=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await auth.auth.signInWithPassword({email:accounts.accountEmails[index],password:accounts.accountPassword});assert.equal(login.error,null);assert.equal(login.data.user.id,accounts.ids[index]);
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(35000);
 await context.route('**/*',request=>{const target=new URL(request.request().url());if([origin,config.url].includes(target.origin))return request.continue();evidence.forbidden.push(target.origin+target.pathname);return request.abort();});
 await page.addInitScript(session=>sessionStorage.setItem('five-alive-session',JSON.stringify(session)),login.data.session);
 const capture=await traceFiveAliveReview(page);page.on('pageerror',error=>evidence.errors.push(error.message));
 const actor={index,auth,page,context,capture};actors.push(actor);await restore(actor);return actor;
}
const gameReply=r=>new URL(r.url()).pathname==='/api/delayed'&&r.request().postDataJSON()?.game==='five-alive';
async function restore(actor){const pending=actor.page.waitForResponse(r=>gameReply(r)&&r.request().postDataJSON().op==='state');await actor.page.goto(url);assert.equal(new URL(actor.page.url()).origin,origin);const response=await pending;assert.equal(response.status(),200,await response.text());actor.snapshot=await response.json();await actor.page.getByLabel('Guess board').waitFor();if(fullApp){const reminder=actor.page.getByRole('button',{name:'Continue playing',exact:true});if(await reminder.isVisible())await reminder.click();}}
const idle=page=>page.waitForFunction(()=>!document.querySelector('[data-reveal],.five-alive-award')&&!document.querySelector('.five-alive-keyboard button:disabled'));
async function guess(actor,word){const page=actor.page;await page.waitForFunction(()=>!!document.querySelector('.five-alive-keyboard')&&!document.querySelector('.five-alive-keyboard button:disabled'));const pending=page.waitForResponse(r=>gameReply(r)&&r.request().postDataJSON().op==='action');await page.keyboard.type(word);await page.keyboard.press('Enter');const response=await pending;assert.equal(response.status(),200,await response.text());actor.snapshot=await response.json();await idle(page);evidence.guesses.push({actor:actor.index,revision:actor.snapshot.revision});}
try{
 const a=await open(0),b=await open(1),answer=fixture.state.fiveAlive.answers[round-1].word;
 const before=[a.snapshot.view.ownScore,a.snapshot.view.opponentScore];
 if(!process.argv.includes('--resume-word')){for(const word of ['STARE','AMPLE','CHEST']){assert.notEqual(word,answer);await guess(a,word);}await guess(a,answer);await guess(b,'PLANT');}
 await a.page.getByText('Waiting for the other player.',{exact:true}).waitFor();
 await restore(a);await a.page.getByRole('button',{name:'Word Results',exact:true}).click();await a.page.getByText('Opponent: Waiting',{exact:true}).waitFor();
 const holdResults=process.argv.includes('--hold-results');
 if(!holdResults)await closeWordResults(a.page);
 await guess(b,'PLANT');
 const pending=holdResults?a.page.waitForResponse(async r=>gameReply(r)&&r.request().postDataJSON().op==='state'&&(await r.json()).view.round===round+1):a.page.getByText('Opponent completed in 3',{exact:true}).waitFor();const submitted=guess(b,answer);
 if(holdResults){const response=await pending;const state=await response.json();assert.ok(state.wordReviews.some(r=>r.round===round&&!r.seen));assert.equal(await a.page.getByText('Opponent completed in 3',{exact:true}).count(),0);assert.ok(await a.page.getByRole('dialog',{name:'Word Results',exact:true}).isVisible());evidence.blockedByOpenResults=true;evidence.beforeClose=await a.capture();await a.page.getByRole('dialog',{name:'Word Results',exact:true}).getByRole('button',{name:'Close',exact:true}).click();await a.page.getByRole('dialog',{name:'Word Results',exact:true}).waitFor({state:'hidden'});await a.page.getByText('Opponent completed in 3',{exact:true}).waitFor({timeout:5000});evidence.releasedByClose=true;}
 await pending;await a.page.screenshot({path:dir+'/trace-first-viewer.png'});evidence.liveFirstViewer=true;
 await restore(a);await a.page.getByText('Opponent completed in 3',{exact:true}).waitFor();evidence.pendingReload=true;
 await Promise.all([submitted,idle(a.page)]);assert.ok((await a.page.locator('.five-alive-round').textContent()).includes('Word '+(round+1)));
 evidence.scores=await a.page.locator('.five-alive-scores strong').allTextContents();const multiplier=fixture.config.multipliers[fixture.state.fiveAlive.answers[round-1].difficulty-1]/100;assert.deepEqual(evidence.scores,[before[0]+Math.round(343*multiplier),before[1]+Math.round(490*multiplier)].map(n=>n.toLocaleString('en-US')));
 await Promise.all([a,b].map(actor=>actor.page.waitForFunction(next=>document.querySelector('.five-alive-round')?.textContent?.includes('Word '+next)&&!!document.querySelector('.five-alive-keyboard')&&!document.querySelector('.five-alive-keyboard button:disabled'),round+1)));evidence.bothReviewsAcknowledged=true;
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.forbidden,[]);evidence.passed=true;
}catch(error){evidence.passed=false;evidence.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{evidence.traces=await Promise.all(actors.map(async actor=>({actor:actor.index,...await actor.capture()})));for(const actor of actors)await actor.page.screenshot({path:dir+'/trace-last-'+actor.index+'.png'});await writeFile(dir+'/review-trace-round-'+round+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,liveFirstViewer:evidence.liveFirstViewer,errors:evidence.errors,traceResponses:evidence.traces.map(t=>t.responses.length)}));await browser.close();for(const actor of actors)await actor.auth.auth.signOut({scope:'local'});}
