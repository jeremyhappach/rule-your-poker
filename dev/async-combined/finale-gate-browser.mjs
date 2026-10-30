import {chromium} from '@playwright/test';
import {createReviewServer} from './review-server.mjs';
import {initialSibling,completedSibling} from './sibling-completion-fixtures.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const port=15411,base='http://127.0.0.1:'+port,checks=[],errors=[],requests=[];
const server=await createReviewServer({port,preview:true,cacheDir:'node_modules/.vite-finale-gate-proof'});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const rules=JSON.parse(read('dev/async-combined/shared-preimage.json')),at=Date.now();
const run=completedSibling(initialSibling('run21',at),at).ownResults[0].board;
const tri={rules:rules.tri,phase:'stage_complete',cards:Array.from({length:28},(_,i)=>i),removed:[0,1],waste:2,stockRemaining:4,run:3,highRun:4,score:45780,deadline:at+5000,result:{score:45780,scoreBefore:0,stageScore:45780,timeBonus:580,stockBonus:6000,reason:'take_score',completedAt:at}};
let seen=new Set(['quint-attempt','quint-child']),finaleSeen=true,finaleInserts=0;
const events=id=>[{id:id+'-attempt',kind:'attempt',actor:'other',actorName:'Opponent',round:3,score:id==='run'?run.result.score:45780,at:new Date(at).toISOString(),receipt:{game:id==='run'?'run21':'tri-towers',rules:id==='run'?rules.run21:rules.tri},board:id==='run'?{...run,playerId:'other'}:tri,seen:seen.has(id+'-attempt')},
 {id:id+'-child',kind:'child',actor:null,round:0,score:null,receipt:{game:id==='run'?'run21':'tri-towers',winner:id==='tri'?'other':'me'},seen:seen.has(id+'-child')}];
function home(){return {id:'match',status:'settled',revision:seen.size,organizer:'me',opponent:'other',players:[{id:'me',name:'Owner'},{id:'other',name:'Opponent'}],
 net:-3,receipt:{match_id:'match'},finaleViewed:finaleSeen,reviewsComplete:seen.size===6,realMoney:false,serverAt:Date.now(),createdAt:new Date(at).toISOString(),acceptedAt:new Date(at).toISOString(),completed:3,unsettled:0,exposure:7,
 lineup:['run','tri','quint'].map((id,i)=>({id,ordinal:i+1,game:['run21','tri-towers','quintzee'][i],stake:[1,5,1][i],terminal:true,viewed:seen.has(id+'-child'),
 scores:{me:50000,other:seen.has(id+'-attempt')?45780:null},pendingResults:{other:seen.has(id+'-attempt')?0:1},result:seen.has(id+'-child')?{winner:id==='tri'?'other':'me',delta:id==='tri'?-5:1}:null}))};}
async function page(viewport){const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname!=='/fixture-review-api')return route.continue();const body=route.request().postDataJSON();requests.push(body);let result;
  switch(body.name){
   case 'delayed_home':case 'delayed_history_detail':result=home();break;
   case 'delayed_reviews':result={events:events(body.args.p_child),terminal:true};break;
   case 'delayed_review_begin':result={elapsed:0,seen:seen.has(body.args.p_event)};break;
   case 'delayed_review_ack':seen.add(body.args.p_event);result=null;break;
   case 'delayed_finale_ack':assert(home().reviewsComplete,'no early finale request');if(!finaleSeen)finaleInserts++;finaleSeen=true;result=null;break;
   case 'delayed_history':result=[{id:'match',opponent:'Opponent',completedAt:new Date(at).toISOString(),count:3,net:-3}];break;
   default:throw Error('Unexpected RPC '+JSON.stringify(body));
  }
  await route.fulfill({json:result});
 });return page;}
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 const phone=await page({width:390,height:844});await phone.goto(base+'/delayed/match?finale=1',{waitUntil:'domcontentloaded',timeout:120000});
 await phone.getByText('View the remaining game results below before the match finale.').waitFor({timeout:120000});assert.equal(await phone.getByRole('link',{name:'View Results'}).count(),2);assert.equal(await phone.locator('.async-finale').count(),0);
 await phone.reload();await phone.getByText('View the remaining game results below before the match finale.').waitFor();pass('phone direct entry and reload reject premature historical finale ACK');
 await phone.getByRole('link',{name:'View Results'}).nth(1).click();await phone.locator('[data-tri-towers]').waitFor();assert.equal(await phone.getByText(/Board preview unavailable/).count(),0);
 await phone.waitForURL(base+'/delayed/match',{timeout:30000});await phone.getByRole('link',{name:'View Results'}).waitFor();assert.equal(await phone.getByRole('link',{name:'View Results'}).count(),1);assert(!seen.has('run-attempt'));assert(!requests.some(r=>r.name==='delayed_finale_ack'));
 await phone.screenshot({path:'qualification.local/async-combined/finale-gate-pending-phone.png',fullPage:true});pass('actual Tri-Towers renderer, count and child overlay return to remaining Run21 review');
 await phone.getByRole('link',{name:'View Results'}).click();await phone.locator('.async-result-review').waitFor();await phone.waitForURL(base+'/delayed/match?finale=1',{timeout:30000});await phone.locator('.async-finale-exit').waitFor({timeout:15000});
 assert.equal(seen.size,6);assert.equal(requests.filter(r=>r.name==='delayed_finale_ack').length,1);await phone.screenshot({path:'qualification.local/async-combined/finale-gate-complete-phone.png'});pass('Run21 final reveal and child overlay precede match finale; old ACK not rewritten');await phone.close();
 seen=new Set(['quint-attempt','quint-child']);finaleSeen=false;
 const desktop=await page({width:1054,height:720});await desktop.goto(base+'/completed');await desktop.getByRole('link',{name:'See Results'}).click();await desktop.getByText('View the remaining game results below before the match finale.').waitFor();assert.equal(await desktop.getByRole('link',{name:'View Results'}).count(),2);pass('desktop archive entry uses the same guard');
 const second=await page({width:390,height:844});await Promise.all([desktop.goto(base+'/delayed/match?review=run'),second.goto(base+'/delayed/match?review=tri')]);
 await Promise.all([desktop,second].map(p=>p.waitForURL(/\/delayed\/match(?:\?finale=1)?$/,{timeout:30000})));
 // Either tab may finish last. Both outcomes must use fresh, complete review state.
 assert.equal(seen.size,6);
 for(const p of [desktop,second]){if(!p.url().includes('finale')){await p.reload();await p.locator('a[href="/delayed/match?finale=1"]').click();}await p.locator('.async-finale-exit').waitFor({timeout:15000});}
 assert.equal(finaleInserts,1);assert.equal(seen.size,6);pass('two browser tabs finish separate reveals; fresh state gates finale and duplicate replay keeps one receipt');
 assert.deepEqual(errors,[]);assert(requests.every(r=>!r.op));pass('no renderer errors, gameplay commands or financial endpoints');
 write('qualification.local/async-combined/finale-gate-browser.json',JSON.stringify({passed:true,checks,errors,scope:'isolated synthetic browser transport; hosted migration held'},null,2));
}finally{await browser.close();await server.close();}
