// Replays the recorded production word/guesses through real components and rules.
// Local memory transport: this cannot qualify hosted Realtime or production.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';
import {traceFiveAliveReview} from './review-trace.mjs';
const out='qualification.local/five-alive/polish';mkdirSync(out,{recursive:true});
const {server,url}=await startPreview(0,{answers:[{word:'EXIST',difficulty:2},{word:'BREAD',difficulty:2},{word:'CRANE',difficulty:2}],valid:['EXIST','CHEST']});
const origin=new URL(url).origin,evidence={scope:'local presentation; recorded production sequence; no hosted delivery claim',requests:[],errors:[],external:[]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
let a,b;const traces=[];
async function open(player){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(35000);
 traces.push({player,capture:await traceFiveAliveReview(page)});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();evidence.external.push(route.request().url());return route.abort();});
 page.on('pageerror',e=>evidence.errors.push(e.message));
 page.on('response',async response=>{if(response.url().endsWith('/fixture/request')){const request=response.request().postDataJSON(),value=await response.json();evidence.requests.push({player,op:request.op,status:response.status(),revision:value.revision,reviewRevision:value.reviewRevision,wordReviews:value.wordReviews,round:value.view?.round});}});
 await page.addInitScript(()=>{window.reviewTrace=[];new MutationObserver(()=>{const label=document.querySelector('.five-alive-review-label')?.textContent??null;if(window.reviewTrace.at(-1)?.label!==label)window.reviewTrace.push({at:performance.now(),label,hidden:document.hidden,online:navigator.onLine});}).observe(document,{childList:true,subtree:true});});
 await page.goto(url+'?mode=async&player='+player);assert.equal(new URL(page.url()).origin,origin);await page.getByLabel('Guess board').waitFor();return page;
}
const idle=page=>page.waitForFunction(()=>!document.querySelector('[data-reveal],.five-alive-award')&&!document.querySelector('.five-alive-keyboard button:disabled'));
async function guess(page,word){await page.waitForFunction(()=>!!document.querySelector('.five-alive-keyboard')&&!document.querySelector('.five-alive-keyboard button:disabled'));await page.keyboard.type(word);await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));await idle(page);}
const rows=page=>page.locator('.five-alive-tiles').allTextContents();
try{
 a=await open('a');b=await open('b');
 for(const word of ['STARE','AMPLE','CHEST','EXIST'])await guess(a,word);
 await a.getByText('Waiting for the other player.',{exact:true}).waitFor();await guess(b,'PLANT');
 await a.reload();await a.getByText('Waiting for the other player.',{exact:true}).waitFor();
 assert.deepEqual((await rows(a)).slice(0,4),['STARE','AMPLE','CHEST','EXIST']);
 await a.getByRole('button',{name:'Word Results',exact:true}).click();await a.getByText('Opponent: Waiting',{exact:true}).waitFor();
 await a.keyboard.press('Escape');await a.getByRole('dialog').waitFor({state:'hidden'});
 assert.ok(!(await a.locator('body').textContent()).includes('PLANT'));
 await guess(b,'PLANT');
 const pending=a.getByText('Opponent completed in 3',{exact:true}).waitFor(),submitted=guess(b,'EXIST');
 await pending;assert.equal((await rows(a))[0],'•••••');await a.screenshot({path:out+'/async-first-viewer-review.png'});
 evidence.firstReview=await a.evaluate(()=>({hidden:document.hidden,online:navigator.onLine,trace:window.reviewTrace}));
 await a.reload();await a.getByText('Opponent completed in 3',{exact:true}).waitFor();
 assert.ok(!(await a.locator('body').textContent()).includes('PLANT'));
 await a.evaluate(()=>window.dispatchEvent(new Event('online')));await a.getByText('Opponent completed in 3',{exact:true}).waitFor();
 await submitted;await idle(a);
 assert.match(await a.locator('.five-alive-round').textContent(),/Word 2/);
 assert.deepEqual(await a.locator('.five-alive-scores strong').allTextContents(),['343','490']);
 const state=await fetch(origin+'/fixture/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'async',player:'a',op:'state'})}).then(r=>r.json());
 assert.ok(state.wordReviews[0].seen);evidence.final={scores:[343,490],round:state.view.round,reviewSeen:true,refresh:true,reconnect:true};
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.external,[]);evidence.passed=true;
 console.log(JSON.stringify({passed:true,productionFailureReproduced:false,scope:evidence.scope,...evidence.final}));
}catch(error){evidence.passed=false;evidence.failure=error.stack;if(a)evidence.firstViewer=await a.evaluate(()=>({url:location.href,hidden:document.hidden,online:navigator.onLine,body:document.body.innerText,trace:window.reviewTrace}));throw error;}
finally{evidence.traces=await Promise.all(traces.map(async({player,capture})=>({player,...await capture()})));writeFileSync(out+'/async-waiting-evidence.json',JSON.stringify(evidence,null,2));await browser.close();server.httpServer?.closeAllConnections();await server.close();}
