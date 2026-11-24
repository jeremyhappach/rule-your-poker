// Isolated bearer-authenticated browser fixtures. SQL authority is qualified separately
// by the rollback proof; this service never connects to production or persists users.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {initialSibling,completedSibling} from '../async-combined/sibling-completion-fixtures.mjs';
const dir='qualification.local/canonical-browser';mkdirSync(dir,{recursive:true});
const tokens=[randomUUID(),randomUUID()],users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const match='44444444-4444-4444-8444-444444444444',child='33333333-3333-4333-8333-333333333333';
let data,requests=[],begins=new Map(),finalFixture,megaFixture;
const fiveOnly=process.argv.includes('--five-alive'),extra=process.argv.includes('--extra')||fiveOnly;
const streams=new Set();
const players=users.map((id,i)=>({id,userId:id,name:i?'Opponent':'Viewer',seat:i+1,isBot:false}));
const triRules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),version:'tri-towers/5',clearCelebrationMs:3000};
function home(user=users[0]){
 const h=structuredClone(data.home);h.serverAt=Date.now();h.players=players;h.organizer=users[0];h.opponent=users[1];
 h.lineup[0].scores={...data.scores};h.lineup[0].pendingResults={[users[1]]:data.events.at(-1)?.seen?0:1};
 h.lineup[0].viewed=data.events.some(e=>e.kind==='child'&&e.seen);
 h.lineup[0].reviewCount=Number(h.lineup[0].terminal&&!h.lineup[0].viewed);
 h.reviewsComplete=h.lineup[0].viewed;return h;
}
function reviews(){return {events:data.events,turnReviewId:data.events.filter(e=>e.kind==='attempt').at(-1)?.id,revealedThrough:data.boundary??0,terminal:data.home.lineup[0].terminal,actor:data.actor,segment:14,revision:28,started:false,held:false,serverAt:Date.now(),expiresAt:new Date(Date.now()+3600000).toISOString(),finalBoard:data.finalBoard};}
function words(user){
 const v=structuredClone(data.snapshot);v.serverAt=Date.now();v.viewerId=user;v.activePlayerId=data.actor;v.canAct=user===data.actor;
 v.scores={...data.scores};delete v.movePresentation;v.rack=[...'CATRISE'].map((face,i)=>({id:i+1,face,value:1}));return v;
}
function setup(game,terminal=false){
 requests=[];begins.clear();
 const f=finalFixture(),base=initialSibling(game==='ptown-words'?'quintzee':game,Date.now());
 if(game==='tri-towers')Object.assign(base,{config:triRules,board:{rules:triRules,phase:'playing',cards:Array.from({length:28},(_,i)=>i),removed:[0,1],waste:28,stockRemaining:23,run:0,highRun:0,deadline:Date.now()+180000,scoreBefore:0,score:0,result:null}});
 if(game==='chucky-showdown'){const b=JSON.parse(readFileSync('dev/async-chucky-cards/projections.json','utf8')).fold_stay;b.since=Date.now();b.due=Date.now()+30000;Object.assign(base,{config:{...b.config,ruleset:'chucky-showdown/3'},board:b,saved:{...b,phase:'round_over',cracks:1,uses:[2,1,0,2,1,0,2],score:10000}});}
 if(game==='take-two'){const rules={version:'take-two/2',stageMs:120000,introMs:2500,holdMs:6000,meterMin:100,meterMax:1000,meterStep:10,meterStepsPerSecond:1,meterHoldMs:1000},b={rules,phase:'playing',slots:[0,1,2,3],current:4,layout:[0,1,2,3].map(i=>({row:0,column:i,x:i})),legalPairs:[[0,1]],exposed:[0,1,2,3],highScore:0,stockRemaining:47,samePairs:0,consecutivePairs:0,meterAt:Date.now(),score:250,deadline:Date.now()+120000,event:{label:'Playing',points:0}};Object.assign(base,{config:rules,board:b,saved:{...b,phase:'stage_complete',result:{reason:'take_score',score:10000,scoreBefore:0,displayScore:10000,stageScore:10000,clearBonus:0,stockBonus:0,timeBonus:0,completedAt:Date.now()}}});}
 if(game==='crib-lab'){const zero={fifteens:0,pairs:0,runs:0,flush:0,nobs:0,total:0},card={rank:'A',suit:'hearts',value:1},b={id:child,revision:1,ruleset:'crib-lab/1',status:'active',serverAt:Date.now(),round:2,roundId:child+':2',phase:'discard',hands:Array.from({length:5},()=>Array.from({length:6},()=>card)),discardMasks:[0,0,0,0,0],stockLeft:22,swapsLeft:3,offer:null,cut:card,durationMs:30000,deadline:Date.now()+30000,phaseUntil:null,score:250,result:null,completion:null};Object.assign(base,{config:{ruleset:'crib-lab/1'},board:b,saved:{...b,phase:'scoring',hands:b.hands.map(h=>h.slice(0,4)),result:{id:'saved',hands:Array.from({length:5},()=>zero),base:0,multiplier:100,award:0,before:0,cumulative:0,scoredAt:Date.now()}}});}
 if(game==='mega-card-golf')Object.assign(base,megaFixture());
 const events=Array.from({length:game==='ptown-words'?13:2},(_,i)=>{
  const round=i+1,id='turn-'+round,score=game==='ptown-words'?8:10000;
  const board=game==='ptown-words'?{...f.snapshot,finished:false,phase:'playing',terminal:undefined,preAdjustmentScores:undefined,rackDeductions:undefined,scores:{[users[0]]:250,[users[1]]:(i+1)*8},turn:round+1,moves:[{...f.snapshot.moves.at(-1),turn:round}],movePresentation:{...f.snapshot.movePresentation,turn:round}}:structuredClone(base.saved??completedSibling(base,Date.now()).ownResults[0].board);
  return {id,kind:'attempt',actor:users[1],actorName:'Opponent',round,score,at:new Date(i*1000).toISOString(),receipt:{game,rules:game==='ptown-words'?f.snapshot.rules:base.config,...(game==='ptown-words'?{move:board.moves[0]}:{})},board,seen:false,...(game==='ptown-words'?{beforeScore:i*8,afterScore:(i+1)*8}:{})};
 });
 data={events,snapshot:{...f.snapshot,deadline:Date.now()+3600000,finished:false,phase:'playing',terminal:undefined,preAdjustmentScores:undefined,rackDeductions:undefined,turn:14,playDeadline:Date.now()+180000,canAct:true,activePlayerId:users[0]},
  actor:users[0],scores:{[users[0]]:250,[users[1]]:game==='ptown-words'?96:10000},boundary:game==='ptown-words'?12:undefined,
  home:{...f.home,status:'active',receipt:null,completed:0,exposure:5,unsettled:5,revision:28,lineup:[{...f.home.lineup[0],game,terminal:false,actor:users[0],starter:users[0],config:base.config,playable:true,startedAt:null,expiresAt:new Date(Date.now()+3600000).toISOString(),playableDeadline:new Date(Date.now()+3600000).toISOString(),result:null}]},
  turn:{...base,id:child,matchId:match,actor:users[0],round:2,segment:14,totals:{[users[0]]:250,[users[1]]:130000},reviewRevision:13}};
 if(terminal){data.home=structuredClone(f.home);data.events=structuredClone(f.events);data.finalBoard=f.snapshot;data.snapshot=f.snapshot;data.scores=f.snapshot.scores;}
}
const server=await createServer({configFile:false,envFile:false,cacheDir:'node_modules/.vite-canonical',plugins:[react(),{name:'authenticated-canonical-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/__delayed_route/')&&!url.pathname.startsWith('/api/delayed'))return next();
 const token=req.headers.authorization?.replace(/^Bearer /,'')??url.searchParams.get('token'),user=users[tokens.indexOf(token)];
 if(!user){res.writeHead(401);res.end(JSON.stringify({error:'Unauthenticated fixture request'}));return;}
 const op=url.pathname.split('/').at(-1);
 if(op==='events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': ready\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 let raw='';for await(const part of req)raw+=part;const q=JSON.parse(raw||'{}');requests.push({op,...q,user});
 let value=null;
 if(op==='auth')value={session:{user:{id:user,email:'fixture@local.test'},access_token:token,refresh_token:token,expires_at:Math.floor(Date.now()/1000)+3600}};
 else if(op==='rpc'){
  const {name,args={}}=q;
  if(name==='delayed_home')value=home(user);
  else if(name==='delayed_list')value=[home(user)];
  else if(name==='delayed_reviews')value=reviews();
  else if(name==='delayed_review_begin'){if(!begins.has(args.p_event))begins.set(args.p_event,Date.now());value={elapsed:Date.now()-begins.get(args.p_event),seen:data.events.find(e=>e.id===args.p_event)?.seen};}
  else if(name==='delayed_review_ack'){const e=data.events.find(e=>e.id===args.p_event);assert(e);e.seen=true;if(e.kind==='attempt'){data.boundary=e.round;data.scores[users[1]]=e.afterScore??data.events.filter(x=>x.kind==='attempt'&&x.round<=e.round).reduce((n,x)=>n+x.score,0);}value={ok:true};}
  else if(name.startsWith('delayed_words_'))value=words(user);
  else if(name==='platform_notification_center')value={items:[],unread:0};
  else if(name==='get_account_access')value={enabled:true};
 }else if(op==='read')value=q.single?null:[];
 else if(op==='delayed'||op==='delayed-run21'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...data.turn,...(fiveOnly?{wordReviews:data.events.map(e=>({id:e.id,round:e.round,seen:e.seen})),reviewRevision:data.events.filter(e=>e.seen).length}:{}),serverAt:Date.now()}));return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:value,error:null}));
 });s.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/delayed'))req.url='/dev/async-words/route.html';next();});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-words/route-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15449,strictPort:true,hmr:false}});
await server.listen();({finalWordsFixture:finalFixture}=await server.ssrLoadModule('/src/lib/delayed/wordsFinalReview.fixture.ts'));
const mega=await server.ssrLoadModule('/src/lib/megaCardGolf/engine.ts'),cfgmod=await server.ssrLoadModule('/src/lib/megaCardGolf/config.ts'),competition=await server.ssrLoadModule('/src/lib/megaCardGolf/competition.ts');
megaFixture=()=>{const config=competition.competitionConfig(cfgmod.INITIAL_COURSES[0],3),fresh=()=>mega.createRun(child,users[0],config.course,Array.from({length:3},()=>Array.from({length:52},(_,i)=>i)),Date.now(),config.version);let b=fresh();for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}])b=mega.applyIntent(b,intent,Date.now());return {config,board:mega.projectRun(fresh(),Date.now()),saved:mega.projectRun(b,Date.now())};};
const root='http://127.0.0.1:15449',results=[],errors=[],browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
async function page(){const p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));return p;}
const ack=()=>requests.filter(q=>q.name==='delayed_review_ack').map(q=>q.args.p_event);
try{
 assert.equal((await fetch(root+'/__delayed_route/rpc',{method:'POST',body:'{}'})).status,401);
 let p;if(!extra){setup('ptown-words');p=await page();
 await p.goto(root+'/delayed?token='+tokens[0]);await p.getByRole('link',{name:/vs. Opponent/}).waitFor();
 assert.equal(await p.getByText(/results? to view/).count(),0);
 await p.goto(root+'/delayed/'+match);await p.getByRole('link',{name:'Take Turn',exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:/View Result/i}).count(),0);
 assert.match(await p.locator('.delayed-scoreboard').innerText(),/96/);await p.screenshot({path:dir+'/words-home.png'});
 await p.getByRole('link',{name:'Take Turn',exact:true}).click();await p.getByText(/Opponent · UP, PA/).waitFor();
 assert.equal(requests.find(q=>q.name==='delayed_review_begin').args.p_event,'turn-13');
 assert.equal(await p.locator('.words-result').count(),0);assert.equal(await p.getByText(/Final rack deductions applied|Game Complete/).count(),0);
 await p.screenshot({path:dir+'/words-latest.png'});
 await p.reload();await p.getByText(/Opponent · UP, PA/).waitFor();assert.deepEqual(ack(),[]);
 await p.context().setOffline(true);await p.waitForTimeout(500);assert.deepEqual(ack(),[]);await p.context().setOffline(false);
 await p.getByRole('button',{name:'Pass',exact:true}).waitFor({state:'visible'});
 await p.waitForFunction(()=>!document.querySelector('.words-turn-actions button:last-child')?.disabled);
 assert.deepEqual(ack(),['turn-13']);assert.equal(data.events.filter(e=>!e.seen).length,12);assert(p.url().endsWith('/play/'+child));
 await p.screenshot({path:dir+'/words-playable.png'});
 await p.reload();await p.getByRole('button',{name:'Pass',exact:true}).waitFor();assert.deepEqual(ack(),['turn-13']);assert.equal(requests.filter(q=>q.name==='delayed_review_begin').every(q=>q.args.p_event==='turn-13'),true);
 results.push('Words: 13 historical turns, zero final results, sole Take Turn, latest only, no terminal copy, direct playable entry, interrupted reveal, offline recovery, refresh');await p.close();
 }
 for(const game of (fiveOnly?[]:extra?['take-two','crib-lab','chucky-showdown','mega-card-golf']:['quintzee','run21','tri-towers','boxdrop'])){
  setup(game);p=await page();await p.goto(root+'/delayed/'+match+'?token='+tokens[0]);const gameplay=p.waitForResponse(r=>r.url().endsWith('/api/delayed')||r.url().endsWith('/api/delayed-run21'),{timeout:30000});await p.getByRole('link',{name:'Take Turn',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.async-result-review'));
  assert.equal(requests.find(q=>q.name==='delayed_review_begin').args.p_event,'turn-2');
  assert.equal(await p.getByText('Game Complete',{exact:true}).count(),0);
  await gameplay;assert.deepEqual(ack(),['turn-2']);assert(p.url().endsWith('/play/'+child));
  assert(requests.some(q=>q.op==='state'&&q.childId===child));await p.screenshot({path:dir+'/'+game+'-playable.png'});
  results.push(game+': latest-only reveal reaches existing gameplay owner without Match Home');await p.close();
 }
 if(!extra){setup('ptown-words',true);p=await page();await p.goto(root+'/delayed?token='+tokens[0]);await p.getByText('1 result to view',{exact:true}).waitFor();
 await p.goto(root+'/delayed/'+match);await p.getByRole('link',{name:'View Result',exact:true}).click();await p.getByText('Game Complete',{exact:true}).waitFor();
 await p.screenshot({path:dir+'/completed-outcome.png'});await p.waitForURL(root+'/delayed/'+match,{timeout:18000});
 assert.deepEqual(ack(),['turn-5','child-result']);assert.equal(data.events[0].seen,false);assert.equal(data.events[1].seen,false);
 results.push('Completed Words: one final-result obligation, final outcome acknowledged, return to Match Home, historical ACKs unchanged');
 }
 if(fiveOnly){
  const rules=await server.ssrLoadModule('/server/fiveAlive/rules.ts');let game=rules.createSealedGame(users,[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}]);
  for(const word of ['APPLE','BREAD'])for(const user of users)game=rules.submitSealedGuess(game,user,word,()=>true);
  setup('ptown-words');data.home.lineup[0].game='five-alive';data.home.lineup[0].config=rules.FIVE_ALIVE_RULES;
  data.events=data.events.slice(0,2).map((e,i)=>({...e,score:i?1000:800,afterScore:i?1800:800,board:null,receipt:{game:'five-alive',rules:rules.FIVE_ALIVE_RULES}}));
  data.scores={[users[0]]:1800,[users[1]]:0};data.turn={id:child,game:'five-alive',revision:28,segment:3,status:'active',terminal:false,held:false,view:rules.sealedProjection(game,users[0])};
  p=await page();await p.goto(root+'/delayed/'+match+'?token='+tokens[0]);await p.getByRole('link',{name:'Take Turn',exact:true}).waitFor();
  await p.waitForFunction(()=>document.querySelector('.five-alive-match-words .delayed-scoreboard strong')?.textContent==='1,800');
  assert.equal(await p.locator('.five-alive-match-words .delayed-scoreboard strong').last().textContent(),'0');assert.equal(await p.getByRole('link',{name:'View Result',exact:true}).count(),0);
  await p.getByRole('link',{name:'Take Turn',exact:true}).click();await p.getByText('Word 2 results',{exact:true}).waitFor();assert.equal(requests.find(q=>q.name==='delayed_review_begin').args.p_event,'turn-2');
  await p.getByLabel('Keyboard',{exact:true}).waitFor({timeout:30000});await p.waitForFunction(()=>!document.querySelector('.five-alive-keyboard button')?.disabled);
  assert.deepEqual(ack(),['turn-2']);assert.equal(data.events[0].seen,false);assert(p.url().endsWith('/play/'+child));await p.screenshot({path:dir+'/five-alive-playable.png'});
  results.push('Five Alive: concealed cumulative score, latest mutually completed word only, older history retained, direct playable next word');
 }
 assert.deepEqual(errors,[]);
 writeFileSync(dir+(fiveOnly?'/five-alive-evidence.json':extra?'/extra-evidence.json':'/evidence.json'),JSON.stringify({passed:true,authentication:'isolated bearer sessions through the production auth guard; HTTP fixture responses; database behavior proven separately in rollback SQL',results,errors},null,2));
 console.log(JSON.stringify({passed:true,results}));
}catch(e){for(const c of browser.contexts())for(const p of c.pages())console.log((await p.locator('body').innerText()).slice(0,2500));throw e;}
finally{await browser.close();for(const r of streams)r.end();await server.close();}

