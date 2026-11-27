// Real routed components and auth guard over isolated bearer-authenticated HTTP fixtures.
// No production connection. Database authority is proved separately by proof.mjs.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {initialSibling,completedSibling} from '../async-combined/sibling-completion-fixtures.mjs';
const dir='qualification.local/async-flow/browser';mkdirSync(dir,{recursive:true});
const token=randomUUID(),me='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const match='44444444-4444-4444-8444-444444444444',child='33333333-3333-4333-8333-333333333333';
const players=[{id:me,name:'Viewer'},{id:other,name:'Opponent'}],streams=new Set(),requests=[],errors=[],results=[];
let turn,seen=false,finaleSeen=false,settled=true,failAck=false;
function setup(terminal=false){
 const base=initialSibling('quintzee',Date.now());
 turn={...base,id:child,matchId:match,actor:me,round:2,segment:4,totals:{[me]:40000,[other]:70000}};
 seen=false;finaleSeen=false;failAck=false;settled=true;requests.length=0;
 if(terminal)Object.assign(turn,{board:null,terminal:true,winner:me});
}
function home(){
 return {id:match,status:turn.terminal&&settled?'settled':'active',revision:turn.revision,realMoney:true,organizer:me,opponent:other,players,
  completed:turn.terminal?1:0,exposure:5,unsettled:turn.terminal?0:5,net:5,createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),
  receipt:turn.terminal&&settled?{match_id:match}:null,reviewsComplete:turn.terminal&&settled&&seen,finaleViewed:finaleSeen,runbackEligible:false,serverAt:Date.now(),
  lineup:[{id:child,ordinal:1,game:'quintzee',stake:5,config:turn.config,actor:me,segment:turn.segment,terminal:turn.terminal,viewed:seen,reviewCount:turn.terminal&&!seen?1:0,
   revision:turn.revision,expiresAt:turn.expiresAt,startedAt:null,scores:turn.totals,result:seen?{reason:'normal',winner:me,delta:5}:null}]};
}
function reviews(){return {events:turn.terminal?[{id:'final',kind:'child',actor:null,round:0,score:null,seen,receipt:{game:'quintzee',winner:me,stake:5,reason:'normal'}}]:[],
 terminal:turn.terminal,actor:me,segment:turn.segment,revision:turn.revision,started:true,held:false,serverAt:Date.now(),expiresAt:turn.expiresAt};}
const server=await createServer({configFile:false,envFile:false,cacheDir:'qualification.local/async-flow/vite',plugins:[react(),{
 name:'async-flow-http-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/__delayed_route/')&&url.pathname!=='/api/delayed')return next();
  if((req.headers.authorization?.replace(/^Bearer /,'')??url.searchParams.get('token'))!==token){res.writeHead(401);res.end('{}');return;}
  const op=url.pathname.split('/').at(-1);
  if(op==='events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': ready\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
  let raw='';for await(const part of req)raw+=part;const q=JSON.parse(raw||'{}');requests.push({op,...q});
  let value=null,error=null;
  if(op==='auth')value={session:{user:{id:me,email:'fixture@local.test'},access_token:token,refresh_token:token,expires_at:Math.floor(Date.now()/1000)+3600}};
  else if(op==='rpc'){
   if(['delayed_home','delayed_history_detail'].includes(q.name))value=home();
   else if(q.name==='delayed_reviews')value=reviews();
   else if(q.name==='delayed_review_ack'){if(failAck)error={message:'Lost ACK'};else {assert.equal(q.args.p_event,'final');seen=true;}}
   else if(q.name==='delayed_finale_ack'){assert(seen&&settled);finaleSeen=true;}
   else if(q.name==='platform_notification_center')value={items:[],unread:0};
   else if(q.name==='get_account_access')value={enabled:true};
  }else if(op==='read')value=q.single?null:[];
  else if(op==='delayed'){
   if(q.op==='action'){
    if(q.intent.type==='bonus_skip'){turn={...turn,revision:turn.revision+1,terminal:true,winner:me,optionalBonus:{actor:me,choice:'skip'}};}
    else if(q.intent.type==='bonus_play'){turn={...turn,revision:turn.revision+1,optionalBonus:{actor:me,choice:'play'}};}
    else if(q.intent.type==='start'){turn={...turn,revision:turn.revision+1,board:initialSibling('quintzee',Date.now()).board};}
    else {const completed=completedSibling(turn,Date.now());turn={...completed,round:3,segment:5,actor:me,totals:{[me]:90000,[other]:70000},
      ownResults:completed.ownResults.map(r=>({...r,round:2})),optionalBonus:{actor:me,choice:'pending'}};}
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...turn,serverAt:Date.now()}));return;
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:value,error}));
 });s.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/delayed'))req.url='/dev/async-words/route.html';next();});}
 }],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-words/route-client.ts')},{find:'@',replacement:resolve('src')}]},
 define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15457,strictPort:true,hmr:false}});
await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const root='http://127.0.0.1:15457',route=root+'/delayed/'+match;
async function page(width=390,height=844){const p=await browser.newPage({viewport:{width,height}});p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));return p;}
const acks=()=>requests.filter(r=>r.name==='delayed_review_ack').length;
try{
 assert.equal((await fetch(root+'/__delayed_route/rpc',{method:'POST',body:'{}'})).status,401);
 setup();let p=await page();await p.goto(route+'/play/'+child+'?token='+token);
 await p.getByRole('button',{name:'Any: unfilled'}).click();
 await p.getByRole('button',{name:'Skip Bonus'}).waitFor();
 assert(p.url().includes('/play/'+child));assert.equal(acks(),0);
 await p.screenshot({path:dir+'/bonus-choice-phone.png'});
 await p.getByRole('button',{name:'Skip Bonus'}).click();
 await p.getByText('Game Complete',{exact:true}).waitFor();assert(p.url().includes('?review='+child+'&finished=1'));
 await p.screenshot({path:dir+'/game-result-phone.png'});
 await p.waitForURL(route+'?finale=1');await p.getByRole('img',{name:/wins the match/}).waitFor();
 assert.equal(acks(),1);await p.screenshot({path:dir+'/match-finale-phone.png'});
 await p.getByRole('link',{name:'Back to Lobby',exact:true}).waitFor();assert(finaleSeen);
 assert.equal(requests.filter(r=>r.op==='action'&&r.intent.type==='bonus_skip').length,1);
 results.push('Opponent round two already submitted: own score -> bonus choice -> Skip -> game result -> final ACK -> match finale, no lobby stop');await p.close();

 setup();p=await page(1280,900);await p.goto(route+'/play/'+child+'?token='+token);await p.getByRole('button',{name:'Any: unfilled'}).click();
 await p.getByRole('button',{name:'Play Bonus'}).waitFor();await p.reload();await p.getByRole('button',{name:'Play Bonus'}).waitFor();
 await p.getByRole('button',{name:'Play Bonus'}).click();
 await p.getByRole('button',{name:/start/i}).waitFor();assert.equal(turn.optionalBonus.choice,'play');assert.equal(turn.terminal,false);
 assert(p.url().includes('/play/'+child));assert.equal(acks(),0);
 await p.screenshot({path:dir+'/bonus-play-desktop.png'});
 results.push('Pending choice survives reload; Play retains round-three Start and original turn ownership');await p.close();

 setup(true);settled=false;p=await page();await p.goto(route+'?review='+child+'&finished=1&token='+token);
 await p.getByText('Game Complete',{exact:true}).waitFor();await p.waitForURL(route);assert.equal(acks(),1);assert.equal(finaleSeen,false);
 results.push('Unfinished parent returns home after exact child ACK, without premature finale');await p.close();

 setup(true);failAck=true;p=await page();await p.goto(route+'?review='+child+'&finished=1&token='+token);
 await p.getByRole('alert').waitFor();assert(p.url().includes('?review='));assert(!seen&&!finaleSeen);
 failAck=false;await p.reload();await p.waitForURL(route+'?finale=1');assert(seen);assert.equal(acks(),2);
 results.push('Lost final ACK blocks finale; reload retries and routes using fresh authoritative completion');await p.close();
 assert.deepEqual(errors,[]);
 writeFileSync(dir+'/evidence.json',JSON.stringify({passed:true,scope:'isolated authenticated HTTP fixture; SQL authority separately proved',results,errors},null,2));
 console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();for(const s of streams)s.end();await server.close();}
