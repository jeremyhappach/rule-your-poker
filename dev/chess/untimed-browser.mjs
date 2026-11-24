import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/chess-untimed/browser';mkdirSync(dir,{recursive:true});
const users=[randomUUID(),randomUUID()],tokens=[randomUUID(),randomUUID()],match=randomUUID(),child=randomUUID(),final=randomUUID();
let s,seen=false,finale=false,failAck=false,ackCalls=0,writeCalls=0,inspectionUser=users[0];
const players=users.map((id,i)=>({id,userId:id,name:i?'Opponent':'Viewer',seat:i+1,isBot:false}));
function home(user){return {id:match,status:s.phase==='complete'?'settled':'active',realMoney:!s.timingPolicy,organizer:users[0],opponent:users[1],players,revision:3,held:false,createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),exposure:5,unsettled:s.phase==='complete'?0:5,completed:s.phase==='complete'?1:0,net:s.phase==='complete'?5:0,receipt:s.phase==='complete'?{result_id:final}:null,reviewsComplete:seen,finaleViewed:finale,runbackEligible:finale,lineup:[{id:child,game:'chess',stake:5,ordinal:1,config:s.rules,revision:3,segment:s.turn,terminal:s.phase==='complete',untimed:!!s.timingPolicy,actor:s.players[s.turnIndex].id,starter:users[0],availableAt:null,lastCallAt:null,expiresAt:s.deadline===null?null:new Date(s.deadline).toISOString(),startedAt:null,playable:s.phase==='playing'&&user===s.players[s.turnIndex].id,reviewCount:s.phase==='complete'&&!seen?1:0,viewed:s.phase!=='complete'||seen,reviewId:s.phase==='complete'?final:null,result:seen?{winner:users[0],reason:'timeout_forfeit',delta:5}:null}]};}
function snapshot(user){return {...s,id:child,viewerId:user,revision:3,serverAt:Date.now(),canAct:s.phase==='playing'&&user===s.players[s.turnIndex].id,paused:false,pausedAt:null,finished:s.phase==='complete',settled:s.phase==='complete',settlement:null,financial:{balances:{}}};}
const server=await createServer({configFile:false,envFile:false,cacheDir:'node_modules/.vite-chess-untimed',plugins:[react(),{name:'chess-isolated-auth',configureServer(v){v.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/__delayed_route/')&&!url.pathname.startsWith('/api/chess'))return next();
 const token=req.headers.authorization?.replace(/^Bearer /,'')??url.searchParams.get('token'),user=users[tokens.indexOf(token)];
 if(!user){res.writeHead(401);res.end('{"error":"Authentication required"}');return;}
 const op=url.pathname.split('/').at(-1);
 if(op==='events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');return;}
 let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw||'{}');let data=null,error=null;
 if(op==='auth')data={session:{user:{id:user,email:'fixture@local.test'},access_token:token,refresh_token:token,expires_at:Math.floor(Date.now()/1000)+3600}};
 else if(op==='rpc'){const {name,args={}}=body;
  if(name==='delayed_home'||name==='delayed_history_detail')data=home(user);
  else if(name==='delayed_list')data=[home(user)];
  else if(name==='delayed_reviews')data={terminal:true,actor:s.players[s.turnIndex].id,segment:s.turn,revision:3,started:false,held:false,serverAt:Date.now(),expiresAt:null,events:[{id:final,kind:'child',actor:null,round:0,seen,receipt:{game:'chess',reason:'timeout_forfeit',winner:users[0],stake:5},at:new Date().toISOString()}]};
  else if(name==='chess_history')data=[{id:child,sessionId:match,completedAt:Date.now(),state:{...s,viewerId:user}}];
  else if(name==='delayed_chess_inspect'){data=snapshot(user);}
  else if(name==='delayed_review_ack'){ackCalls++;if(failAck){error={message:'Isolated lost acknowledgement'};}else seen=true;}
  else if(name==='delayed_finale_ack'){finale=true;}
  else if(name==='platform_notification_center')data={items:[],unread:0};
  else if(name==='get_account_access')data={enabled:true};
 }else if(op==='chess'){if(body.op==='action')writeCalls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot(user)));return;}
 else if(op==='read')data=body.single?null:[];
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}));
 });v.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/delayed'))req.url='/dev/async-words/route.html';next();});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-words/route-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15459,strictPort:true,hmr:false}});
await server.listen();
const rules=await server.ssrLoadModule('/src/lib/chess/rules.ts');
const initial=()=>rules.newChess({identity:{sessionId:match,dealerGameId:child,roundId:child},players,backgroundId:'',mode:'async'},Date.now());
const ended=()=>{s=initial();s.turnIndex=1;s.opened=true;s.deadline=Date.now()-1;s=rules.chessTimeout(s,Date.now());seen=false;finale=false;};
ended();
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:15459/delayed/'+match;
const open=async(path='',user=0)=>page.goto(url+path+(path.includes('?')?'&':'?')+'token='+tokens[user]);
try{
 assert.equal((await fetch('http://127.0.0.1:15459/__delayed_route/auth')).status,401);
 await open('?review='+child);
 await page.getByText('Opponent timed out · Viewer wins',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
 await page.screenshot({path:dir+'/timeout.png'});
 await page.waitForURL(u=>u.pathname==='/delayed/'+match&&!u.searchParams.has('review'),{timeout:25000});
 assert.equal(seen,true);assert.equal(ackCalls,1);
 await page.reload();await page.getByRole('link',{name:'View match results',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'View Result',exact:true}).count(),0);
 await page.getByRole('link',{name:'View match results',exact:true}).click();
 await page.getByRole('link',{name:'Back to Lobby',exact:true}).waitFor({timeout:20000});assert.equal(finale,true);
 // A lost acknowledgement remains pending and a new visit retries the same result.
 ended();failAck=true;await open('?review='+child);await page.getByText('Unable to confirm viewing. Return to match home and retry.').waitFor({timeout:25000});assert.equal(seen,false);
 failAck=false;await open('?review='+child);await page.waitForURL(u=>!u.searchParams.has('review'),{timeout:25000});assert.equal(seen,true);
 // Interrupted review never marks the result seen. Refresh resumes it.
 ended();await open('?review='+child);await page.getByText('Opponent timed out · Viewer wins',{exact:true}).waitFor();await page.reload();assert.equal(seen,false);
 await page.waitForURL(u=>!u.searchParams.has('review'),{timeout:25000});assert.equal(seen,true);
 // Untimed actor and passive opponent recover the same board without timer/bank controls.
 s={...initial(),timingPolicy:'play-money-untimed/1',deadline:null,clockDuration:0,opened:true};seen=false;
 await open();await page.getByRole('link',{name:'Take Turn',exact:true}).waitFor();await page.getByRole('link',{name:'Take Turn',exact:true}).click();
 await page.getByRole('button',{name:'e2 White Pawn',exact:true}).waitFor();
 assert.equal(await page.getByRole('timer').count(),0);assert.equal(await page.getByRole('button',{name:/Use time bank/}).count(),0);assert.equal(writeCalls,0);
 await page.reload();await page.getByRole('button',{name:'e2 White Pawn',exact:true}).waitFor();assert.equal(await page.getByRole('timer').count(),0);
 await page.screenshot({path:dir+'/untimed.png'});
 await open('',1);await page.getByRole('link',{name:'View board',exact:true}).click();await page.getByText("Opponent's Turn — View Only · Viewer").waitFor();
 assert.equal(writeCalls,0);assert.deepEqual(errors,[]);
 writeFileSync(dir+'/result.json',JSON.stringify({passed:true,authentication:'isolated bearer-authenticated HTTP fixture, not hosted Supabase',cases:['timeout auto sequence and ACK','lobby reconciliation after refresh','match finale ACK','lost ACK retry','interrupted review refresh','untimed actor/reconnect','passive opponent/no clock/no banks'],ackCalls,writeCalls,errors},null,2));
 console.log('PASS authenticated Chess route fixtures, timeout ACK/finale/retry/reconnect and untimed controls');
}finally{await browser.close();await server.close();}

