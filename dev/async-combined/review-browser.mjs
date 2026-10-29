import {createReviewServer} from './review-server.mjs';import {chromium} from '@playwright/test';
import {readFileSync as read,writeFileSync as write} from 'node:fs';import assert from 'node:assert/strict';
import {initialSibling,completedSibling} from './sibling-completion-fixtures.mjs';
const server=await createReviewServer();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
try{
 const warm=await browser.newPage();await warm.goto('http://127.0.0.1:15323/review-warmup',{waitUntil:'domcontentloaded',timeout:120000});await warm.waitForFunction(()=>document.body.dataset.reviewReady==='true',null,{timeout:120000});assert.equal((await (await fetch('http://127.0.0.1:15323/review-health')).json()).ready,true);console.log('PASS warm browser module graph and server readiness');await warm.close();
 for(const game of process.env.REVIEW_UI_ONLY||process.env.REVIEW_REMAINING?[]:['run21','tri-towers','quintzee','boxdrop','ptown-words']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];let seen=false,started=false;
  page.on('pageerror',e=>errors.push(e.message));const at=Date.now();
  let initial,board,config;
  if(['run21','quintzee','boxdrop'].includes(game)){initial=initialSibling(game,at);board=completedSibling(initial,at).ownResults[0].board;config=initial.config;board.playerId='other';}
  else if(game==='tri-towers'){config={...JSON.parse(read('src/lib/triTowers/rules-v2.json')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};board={rules:config,phase:'stage_complete',cards:Array.from({length:28},(_,i)=>i),removed:[0,1],waste:2,stockRemaining:4,run:3,highRun:4,score:45780,deadline:at+5000,result:{score:45780,scoreBefore:0,stageScore:45780,timeBonus:580,stockBonus:6000,reason:'take_score',completedAt:at}};initial={id:'child',matchId:'match',game,config,revision:2,segment:2,actor:'me',round:1,board:{...board,phase:'ready',result:null,deadline:at+30000},totals:{me:0,other:0},terminal:false,held:false,expiresAt:new Date(at+129600000).toISOString(),serverAt:at,ownResults:[]};}
  else{config={version:'ptown-words/3',turnMs:129600000};board={rules:config,players:[{id:'me',userId:'me',name:'Hap',seat:1,isBot:false},{id:'other',userId:'other',name:'Opponent',seat:2,isBot:false}],activePlayerId:'me',board:Array(225).fill(null),scores:{me:12,other:25},turn:3,deadline:0,bagCount:70,moves:[],event:{label:'CAT',points:25}};board.board[112]={id:1,face:'C',letter:'C',value:3};}
  const word=game==='ptown-words',event={id:'event',kind:'attempt',actor:'other',actorName:'Jeremy',round:1,score:board.result?.score??25,at:new Date(at).toISOString(),receipt:{game,rules:config},board};
  const home={id:'match',status:'settled',players:[{id:'me',name:'Hap'},{id:'other',name:'Opponent'}],net:-5,lineup:[{id:'child',game,ordinal:1,stake:5,terminal:true,result:{winner:'other',delta:-5}}],receipt:null};
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname!=='/fixture-review-api')return route.continue();const body=route.request().postDataJSON();requests.push(body);let value;
   if(body.name==='delayed_reviews')value={events:[{...event,seen},...(word?[{id:'final',kind:'child',receipt:{winner:'other'},seen:false}]:[])],terminal:word,actor:'me',segment:2,revision:2,started,expiresAt:new Date(at+129600000).toISOString(),held:false,serverAt:Date.now()};
   else if(body.name==='delayed_review_begin')value={elapsed:0,seen:false};
   else if(body.name==='delayed_review_ack'){seen=true;value=null;}
   else if(body.name==='delayed_home')value=home;
   else if(body.op){if(body.op==='action'){assert(seen,'must review before start');assert.equal(body.intent.type,'start');started=true;}value={...initial,revision:initial.revision+(started?1:0),board:started?initial.board:null,serverAt:Date.now()};}
   await route.fulfill({json:value??null});
  });
  console.log('Checking',game);await page.goto('http://127.0.0.1:15323/review'+(word?'?mode=child':''),{waitUntil:'domcontentloaded',timeout:60000});
  try{await page.locator('[data-fullscreen-board-slot]').waitFor();}catch(e){console.log(game,errors,requests,await page.locator('body').innerText());await page.screenshot({path:'qualification.local/async-combined/review-failure.png'});throw e;}
  await page.screenshot({path:'qualification.local/async-combined/review-'+game+'.png'});
  assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
  await page.waitForFunction(()=>document.body.textContent.includes('banked')||!!document.querySelector('[data-fullscreen-board-slot]'),null,{timeout:15000});
  await page.waitForTimeout(10500);
  if(!word)assert.equal(requests.filter(r=>r.op==='action').length,1,game+' exactly one start');
  assert(!await page.getByText('Board preview unavailable. The saved score is shown above.').count(),game+' real renderer must succeed');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,game+' phone overflow');
  assert.deepEqual(errors,[]);checks.push({game,passed:true,actions:requests.filter(r=>r.op==='action').length});await page.close();
 }

 for(const net of process.env.REVIEW_UI_ONLY?[]:[5,-5,0]){
  const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname!=='/fixture-review-api')return route.continue();const body=route.request().postDataJSON();requests.push(body);const value=body.name==='delayed_history_detail'?{id:'match',status:'settled',players:[{id:'me',name:'Hap'},{id:'other',name:'Jeremy'}],net,receipt:{match_id:'match'},lineup:[{id:'child',ordinal:1,game:'run21',result:{delta:net}}]}:null;await route.fulfill({json:value});});
  await page.goto('http://127.0.0.1:15323/review?mode=finale');await page.locator('.async-finale').waitFor();
  assert.equal(await page.locator('.async-confetti').count(),net>0?1:0);assert.equal(await page.locator('.async-chip-transfer').count(),net===0?0:1);if(net===0){assert.equal(await page.locator('.boxer-neutral').count(),2);assert.equal(await page.locator('.boxer-winner,.boxer-loser').count(),0);assert.equal(await page.getByRole('img',{name:'Match drawn'}).count(),1);}
  const bounds=await page.locator('[data-fullscreen-board-slot]').boundingBox();assert(bounds.height>500,'canonical finale fills phone');
  await page.screenshot({path:'qualification.local/async-combined/review-finale-'+net+'.png'});
  await page.waitForTimeout(6200);assert.equal(await page.locator('.async-finale').getAttribute('data-phase'),'breakdown');
  await page.getByRole('heading',{name:'Match home destination'}).waitFor();assert.equal(requests.filter(r=>r.name==='delayed_finale_ack').length,1);assert(!requests.some(r=>r.op==='action'));assert.deepEqual(errors,[]);
  checks.push({finaleNet:net,passed:true});await page.close();
 }

 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844}}),requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const now=Date.now(),players=[{id:'me',name:'Hap'},{id:'other',name:'Jeremy Happach'}];
  const lineup=['run21','tri-towers','quintzee','boxdrop','ptown-words'].map((game,i)=>({id:'child'+i,ordinal:i+1,game,stake:5,terminal:i===1,actor:i%2?'other':'me',scores:{me:45780,other:i===1?null:22000},pendingResults:{other:i===1?1:0},progress:{me:'Next Round: 2',other:'Next Round: 1'},result:null,viewed:i!==1,expiresAt:new Date(now+36*3600000).toISOString(),lastCallAt:new Date(now+24*3600000).toISOString(),bagCount:42}));
  const home={id:'match',status:'active',organizer:'me',opponent:'other',players,lineup,net:5,unsettled:20,exposure:25,createdAt:new Date(now).toISOString(),acceptedAt:new Date(now).toISOString(),completed:1,serverAt:now,realMoney:false,receipt:null};
  const history=Array.from({length:32},(_,i)=>({id:'history'+i,opponent:'Jeremy',completedAt:new Date(now-i*1000).toISOString(),startedAt:new Date(now-86400000).toISOString(),count:5,net:i%2?5:-5,realMoney:false}));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname!=='/fixture-review-api')return route.continue();const body=route.request().postDataJSON();requests.push(body);let value=body.name==='delayed_list'?[home]:body.name==='delayed_history_detail'?{...home,status:'settled',completed:5,unsettled:0,receipt:{match_id:'match'},lineup:lineup.map((c,i)=>({...c,terminal:true,progress:{me:'Complete',other:'Complete'},scores:i===3?{me:45780,other:60000}:c.scores,result:{winner:i%2?'other':'me',delta:i%2?-5:5}}))}:body.name==='delayed_history'?(body.args.p_before_id?history.slice(30):history.slice(0,30)):home;await route.fulfill({json:value});});
  await page.goto('http://127.0.0.1:15323/delayed/match?mode=home',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('heading',{name:'Hap vs. Jeremy Happach'}).waitFor();
  assert.equal(await page.getByText('36h 0m',{exact:true}).count(),4);
  assert.equal(await page.getByText('Unsettled: $20',{exact:true}).count(),1);assert.equal(await page.getByText('Awaiting reveal',{exact:true}).count(),1);assert.equal(await page.getByText('1 pending result · viewed points shown',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'home phone overflow');
  assert(await page.locator('.delayed-scoreboard strong').first().evaluate(el=>el.scrollWidth<=el.clientWidth),'score is readable without clipping');
  await page.screenshot({path:'qualification.local/async-combined/review-home-'+width+'.png',fullPage:true});
  await page.goto('http://127.0.0.1:15323/delayed?mode=list',{waitUntil:'domcontentloaded'});await page.locator('.delayed-card-link').waitFor();
  await page.locator('.delayed-card-link').focus();assert.equal(await page.locator('.delayed-card-link').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Hap vs. Jeremy Happach'}).waitFor();
  await page.goto('http://127.0.0.1:15323/delayed?mode=list',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Load older async matches'}).click();await page.waitForFunction(()=>document.querySelectorAll('.delayed-history-card').length===32);assert.equal(await page.getByRole('button',{name:'Load older async matches'}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'history phone overflow');await page.screenshot({path:'qualification.local/async-combined/review-history-'+width+'.png'});
  await page.goto('http://127.0.0.1:15323/delayed/match?mode=home&history=1',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Hap vs. Jeremy Happach'}).waitFor();assert.equal(await page.getByText('Unsettled: $0',{exact:true}).count(),1);assert.equal(await page.getByText('Play money · settled · 5/5 complete',{exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Take Turn',exact:true}).count(),0);assert.equal(await page.locator('.delayed-danger').count(),0);assert.equal(await page.getByRole('button',{name:'Delete play-money match',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'View Results',exact:true}).count(),5);assert(requests.some(r=>r.name==='delayed_history_detail'));assert(!requests.some(r=>r.op==='action'||['delayed_respond','delayed_remove','delayed_finale_ack'].includes(r.name)));await page.screenshot({path:'qualification.local/async-combined/review-history-detail-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);checks.push({homeHistoryWidth:width,passed:true});await page.close();
 }
 write('qualification.local/async-combined/'+(process.env.REVIEW_REMAINING?'review-remaining-browser.json':process.env.REVIEW_UI_ONLY?'review-ui-browser.json':'review-browser.json'),JSON.stringify(checks,null,2));console.log('PASS',checks);
}finally{await browser.close();await server.close();}
