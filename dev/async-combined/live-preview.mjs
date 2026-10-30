import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const peers=new Map(),presence=new Map();let at,actor,revision,board,moves,score;
function reset(){at=Date.now();actor='a';revision=(revision??0)+1;board=Array(225).fill(null);moves=[];score={a:0,b:0};presence.clear();notify();}
const players=[{id:'a',userId:'a',name:'Alex',seat:1,isBot:false},{id:'b',userId:'b',name:'Blair',seat:2,isBot:false}];
const rack=[...'CATRISE'].map((face,id)=>({id:id+1,face,value:face==='C'?3:1}));
const deadline=()=>at+36*3600000;
const topic=()=>`delayed-playing:match:words:${actor}:${deadline()}`;
function emit(p,data){p.res.write('data: '+JSON.stringify(data)+'\n\n');}
function sync(){for(const p of peers.values())if(p.topic.startsWith('delayed-playing:'))emit(p,{event:'presence',state:p.topic===topic()?Object.fromEntries([...presence].filter(([,v])=>v.topic===p.topic).map(([id,v])=>[id,[{presence_ref:id,...v.payload}]])):{}});}
function notify(){for(const p of peers.values())if(!p.topic.startsWith('delayed-playing:'))emit(p,{event:'postgres_changes',payload:{new:{match_id:'match',user_id:p.viewer}}});sync();}
reset();
const home=viewer=>({id:'match',status:'active',revision,realMoney:false,offerHash:'fixture',organizer:'a',opponent:'b',players,createdAt:new Date(at).toISOString(),acceptedAt:new Date(at).toISOString(),held:false,completed:0,net:0,unsettled:10,exposure:10,receipt:null,serverAt:Date.now(),lineup:['words','other-words'].map((id,i)=>({id,ordinal:i+1,game:'ptown-words',stake:5,config:{},actor:i?'b':actor,segment:revision,revision,terminal:false,expiresAt:new Date(deadline()).toISOString(),lastCallAt:new Date(at+24*3600000).toISOString(),availableAt:new Date(at).toISOString(),startedAt:null,bagCount:86,scores:{[viewer]:score[viewer],[viewer==='a'?'b':'a']:null},result:null}))});
const snapshot=viewer=>({identity:{sessionId:'match',dealerGameId:'words',roundId:'words'},revision,serverAt:Date.now(),rules:{version:'ptown-words/3',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:36*3600000},players,viewerId:viewer,activePlayerId:actor,board,rack:viewer===actor?rack:[],scores:score,turn:revision,deadline:deadline(),canAct:viewer===actor,paused:false,phase:'playing',bagCount:86,rackCounts:{a:7,b:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves,event:{label:'Local preview',points:0}});
const landing=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;background:#12202d;color:#eee;max-width:760px;margin:30px auto;padding:20px}a{color:#9eead6}li{margin:18px}</style><h1>Secondary preview scenarios</h1><p><a href="/">Return to the Words board</a></p><p>Actual game views and match cards, synthetic local accounts and transport. No production connection. Publication held.</p><h2>Words: full → medium → close</h2><ul>${['Full board','Medium','Closest'].map((s,i)=>`<li><a href="/start?zoom=${i}">${s}</a></li>`).join('')}</ul><p>Tap the board to move in one scale; double tap to move out. At closest, select a rack tile and tap a square to place. Place C and A beside each other, then select T to try automatic placement. Submit demonstrates an accepted-word return to full.</p><p><a href="/scenarios/bell?viewer=b">Notification visibility check (test screen)</a></p><h2>Two-client presence</h2><p>Open a Words link above as Alex, then open <a target="_blank" href="/delayed/match?viewer=b">Blair's match home</a> in a separate browser window. Keep both visible side by side. Only the first child should pulse. Backgrounding or leaving Alex's board stops presence. At closest zoom, choose C and place it on PT, choose A and place immediately right, then choose T and Submit Word. Blair's first card changes to Your turn without refresh. Fresh Words links reset this shared synthetic match; open Alex first.</p><h2>Quintzee final bonuses</h2><ul>${['upper','fill','both','neither'].map(b=>`<li>${b}: <a href="/quintzee?bonus=${b}">Own result</a> · <a href="/quintzee?bonus=${b}&replay=1">Opponent replay</a></li>`).join('')}</ul><p>These scripted result fixtures resolve after 1.5 seconds and retain labels through the count-up. Reload to replay.</p>`;
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'local-interaction-fixtures',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;
 if(path==='/'){res.writeHead(302,{Location:'/delayed/match/play/words?viewer=a&zoom=0&fresh=1'});res.end();return;}
 if(path==='/scenarios'){res.setHeader('Content-Type','text/html');res.end(landing);return;}
 if(path==='/main'){res.writeHead(302,{Location:'/scenarios/bell?viewer=b'});res.end();return;}
 if(path==='/start'){const zoom=['0','1','2'].includes(url.searchParams.get('zoom'))?url.searchParams.get('zoom'):'0';res.writeHead(302,{Location:'/delayed/match/play/words?viewer=a&zoom='+zoom+'&fresh=1'});res.end();return;}
 if(path==='/preview/events'){
  const viewer=url.searchParams.get('viewer'),id=url.searchParams.get('id'),t=url.searchParams.get('topic');
  if(!['a','b'].includes(viewer)||t.startsWith('delayed-playing:')&&t!==topic()){res.writeHead(403);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');peers.set(id,{res,viewer,topic:t});sync();req.on('close',()=>{peers.delete(id);presence.delete(id);sync();});return;
 }
 if(path==='/preview/api'){
  try{let raw='';for await(const c of req)raw+=c;const q=JSON.parse(raw),viewer=req.headers['x-preview-viewer'];if(!['a','b'].includes(viewer))throw Error('Unknown synthetic viewer');let data=null;
   if(q.name==='presence'){if(q.topic!==topic()||viewer!==actor||peers.get(q.id)?.viewer!==viewer)throw Error('Presence denied');presence.set(q.id,{topic:q.topic,payload:q.payload});sync();}
   else if(q.name==='leave'){if(peers.get(q.id)?.viewer===viewer)presence.delete(q.id);sync();}
   else if(q.name==='delayed_home')data=home(viewer);
   else if(q.name==='delayed_list')data=[home(viewer)];
   else if(q.name==='delayed_words_snapshot')data=snapshot(viewer);
   else if(q.name==='delayed_words_action'){
    if(viewer!==actor)throw Error('Not your fixture turn');const action=q.args.p_action,items=q.args.p_items??[];
    if(action==='place'){for(const p of items)board[p.square]={...rack.find(t=>t.id===p.tileId),letter:p.letter};score[viewer]+=5;moves.push({turn:revision,playerId:viewer,action:'place',points:5,count:items.length,words:[{word:items.map(p=>p.letter).join(''),points:5,square:items[0]?.square,direction:0}]});}
    actor=actor==='a'?'b':'a';revision++;at=Date.now();notify();data=snapshot(viewer);
   }else if(q.name==='platform_notification_center')data={items:[{id:'notice',match_id:'match',kind:'turn',revision,read_revision:0,actionable:true,payload:{availableCount:1,lastCall:false}}],actionable:1};else if(q.name.includes('notification'))data=null;else throw Error('Unsupported preview operation: '+q.name);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
 }
 if(path.startsWith('/delayed')||path==='/quintzee'||path==='/scenarios/bell'){
  if(path==='/delayed/match/play/words'&&url.searchParams.get('fresh')==='1')reset();
  const html=await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-combined/live-preview-fixture.tsx"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return;
 }next();
});}}],resolve:{alias:[{find:'@/hooks/useAuthGuard',replacement:resolve('dev/async-combined/live-preview-auth.ts')},{find:'@/integrations/supabase/client',replacement:resolve('dev/async-combined/live-preview-transport.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15403,strictPort:true}});
await server.listen();console.log('LOCAL fixture preview http://127.0.0.1:15403/');
