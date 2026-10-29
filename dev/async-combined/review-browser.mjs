import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {chromium} from '@playwright/test';
import {resolve} from 'node:path';import {readFileSync as read,writeFileSync as write} from 'node:fs';import assert from 'node:assert/strict';
import {initialSibling,completedSibling} from './sibling-completion-fixtures.mjs';
const root=process.cwd(),transport=resolve(root,'dev/async-combined/review-transport.ts');
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'review-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(!['/review','/delayed/match'].includes(req.url?.split('?')[0]))return next();s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-combined/review-fixture.tsx"></script></body></html>').then(html=>{res.setHeader('Content-Type','text/html');res.end(html);});});}}],optimizeDeps:{entries:['dev/async-combined/review-fixture.tsx']},resolve:{alias:[{find:'@/integrations/supabase/client',replacement:transport},{find:'@/lib/delayed/client',replacement:transport},{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port:15323,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
try{
 for(const game of ['run21','tri-towers','quintzee','boxdrop','ptown-words']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];let seen=false,started=false;
  page.on('pageerror',e=>errors.push(e.message));const at=Date.now();
  let initial,board,config;
  if(['run21','quintzee','boxdrop'].includes(game)){initial=initialSibling(game,at);board=completedSibling(initial,at).ownResults[0].board;config=initial.config;board.playerId='other';}
  else if(game==='tri-towers'){config={...JSON.parse(read('src/lib/triTowers/rules-v2.json')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};board={rules:config,phase:'stage_complete',cards:Array.from({length:28},(_,i)=>i),removed:[0,1],waste:2,stockRemaining:4,run:3,highRun:4,score:45780,deadline:at+5000,result:{score:45780,scoreBefore:0,stageScore:45780,timeBonus:580,stockBonus:6000,reason:'take_score',completedAt:at}};initial={id:'child',matchId:'match',game,config,revision:2,segment:2,actor:'me',round:1,board:{...board,phase:'ready',result:null,deadline:at+30000},totals:{me:0,other:0},terminal:false,held:false,expiresAt:new Date(at+129600000).toISOString(),serverAt:at,ownResults:[]};}
  else{config={version:'ptown-words/3',turnMs:129600000};board={rules:config,players:[{id:'me',userId:'me',name:'Hap',seat:1,isBot:false},{id:'other',userId:'other',name:'Opponent',seat:2,isBot:false}],activePlayerId:'me',board:Array(225).fill(null),scores:{me:12,other:25},turn:3,deadline:0,bagCount:70,moves:[],event:{label:'CAT',points:25}};board.board[112]={id:1,face:'C',letter:'C',value:3};}
  const word=game==='ptown-words',event={id:'event',kind:'attempt',actor:'other',round:1,score:board.result?.score??25,at:new Date(at).toISOString(),receipt:{game,rules:config},board};
  const home={id:'match',status:'settled',players:[{id:'me',name:'Hap'},{id:'other',name:'Opponent'}],net:-5,lineup:[{id:'child',game,ordinal:1,stake:5,terminal:true,result:{winner:'other',delta:-5}}],receipt:null};
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname!=='/fixture-review-api')return route.continue();const body=route.request().postDataJSON();requests.push(body);let value;
   if(body.name==='delayed_reviews')value={events:[{...event,seen},...(word?[{id:'final',kind:'child',receipt:{winner:'other'},seen:false}]:[])],terminal:word,actor:'me',segment:2,revision:2,started,expiresAt:new Date(at+129600000).toISOString(),held:false,serverAt:Date.now()};
   else if(body.name==='delayed_review_begin')value={elapsed:0,seen:false};
   else if(body.name==='delayed_review_ack'){seen=true;value=null;}
   else if(body.name==='delayed_home')value=home;
   else if(body.op){if(body.op==='action'){assert(seen,'must review before start');assert.equal(body.intent.type,'start');started=true;}value={...initial,revision:initial.revision+(started?1:0),board:started?initial.board:null,serverAt:Date.now()};}
   await route.fulfill({json:value??null});
  });
  console.log('Checking',game);await page.goto('http://127.0.0.1:15323/review'+(word?'?mode=child':''));
  try{await page.locator('[data-fullscreen-board-slot]').waitFor();}catch(e){console.log(game,errors,requests,await page.locator('body').innerText());await page.screenshot({path:'qualification.local/async-combined/review-failure.png'});throw e;}
  await page.screenshot({path:'qualification.local/async-combined/review-'+game+'.png'});
  assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
  await page.waitForFunction(()=>document.body.textContent.includes('banked')||!!document.querySelector('[data-fullscreen-board-slot]'),null,{timeout:15000});
  await page.waitForTimeout(6500);
  if(!word)assert.equal(requests.filter(r=>r.op==='action').length,1,game+' exactly one start');
  assert(!await page.getByText('Board preview unavailable. The saved score is shown above.').count(),game+' real renderer must succeed');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,game+' phone overflow');
  assert.deepEqual(errors,[]);checks.push({game,passed:true,actions:requests.filter(r=>r.op==='action').length});await page.close();
 }

 for(const net of [5,-5,0]){
  const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname!=='/fixture-review-api')return route.continue();const body=route.request().postDataJSON();requests.push(body);const value=body.name==='delayed_history_detail'?{id:'match',status:'settled',players:[{id:'me',name:'Hap'},{id:'other',name:'Jeremy'}],net,receipt:{match_id:'match'},lineup:[{id:'child',ordinal:1,game:'run21',result:{delta:net}}]}:null;await route.fulfill({json:value});});
  await page.goto('http://127.0.0.1:15323/review?mode=finale');await page.locator('.async-finale').waitFor();
  assert.equal(await page.locator('.async-confetti').count(),net>0?1:0);assert.equal(await page.locator('.async-chip-transfer').count(),net===0?0:1);
  const bounds=await page.locator('[data-fullscreen-board-slot]').boundingBox();assert(bounds.height>500,'canonical finale fills phone');
  await page.screenshot({path:'qualification.local/async-combined/review-finale-'+net+'.png'});
  await page.waitForTimeout(6200);assert.equal(await page.locator('.async-finale').getAttribute('data-phase'),'breakdown');
  await page.getByRole('heading',{name:'Match home destination'}).waitFor();assert.equal(requests.filter(r=>r.name==='delayed_finale_ack').length,1);assert(!requests.some(r=>r.op==='action'));assert.deepEqual(errors,[]);
  checks.push({finaleNet:net,passed:true});await page.close();
 }
 write('qualification.local/async-combined/review-browser.json',JSON.stringify(checks,null,2));console.log('PASS',checks);
}finally{await browser.close();await server.close();}
