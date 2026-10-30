// Isolated, immutable pulse-only scenario. Never shares the handoff demo's state.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const at=Date.now(),deadline=at+36*3600000,peers=new Map(),presence=new Map();
const topic=`delayed-playing:pulse:words:a:${deadline}`;
const players=[{id:'a',userId:'a',name:'Alex',seat:1,isBot:false},{id:'b',userId:'b',name:'Blair',seat:2,isBot:false}];
const rack=[...'CATRISE'].map((face,id)=>({id:id+1,face,value:face==='C'?3:1}));
const home=viewer=>({id:'pulse',status:'active',revision:1,realMoney:false,offerHash:'pulse-only',organizer:'a',opponent:'b',players,createdAt:new Date(at).toISOString(),acceptedAt:new Date(at).toISOString(),held:false,completed:0,net:0,unsettled:5,exposure:5,receipt:null,serverAt:Date.now(),lineup:[{id:'words',ordinal:1,game:'ptown-words',stake:5,config:{},actor:'a',segment:1,revision:1,terminal:false,expiresAt:new Date(deadline).toISOString(),lastCallAt:new Date(at+24*3600000).toISOString(),availableAt:new Date(at).toISOString(),startedAt:null,bagCount:86,scores:{[viewer]:0,[viewer==='a'?'b':'a']:null},result:null}]});
const snapshot=viewer=>({identity:{sessionId:'pulse',dealerGameId:'words',roundId:'words'},revision:1,serverAt:Date.now(),rules:{version:'ptown-words/3',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:36*3600000},players,viewerId:viewer,activePlayerId:'a',board:Array(225).fill(null),rack:viewer==='a'?rack:[],scores:{a:0,b:0},turn:1,deadline,canAct:viewer==='a',paused:false,phase:'playing',bagCount:86,rackCounts:{a:7,b:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves:[],event:{label:'Isolated pulse preview',points:0}});
function sync(){for(const p of peers.values())if(p.topic===topic)p.res.write('data: '+JSON.stringify({event:'presence',state:Object.fromEntries([...presence].map(([id,payload])=>[id,[{presence_ref:id,...payload}]]))})+'\n\n');}
const page=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alex playing · Blair waiting — isolated pulse demo</title><style>body{margin:0;background:#10202c;color:#eee;font:16px system-ui}header{padding:12px 20px}h1{font-size:20px;margin:0 0 8px}p{margin:6px 0}a{color:#9ce8d7}.panes{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 12px 12px}.pane{min-width:0}h2{font-size:16px}iframe{width:100%;height:740px;border:1px solid #48616d;box-sizing:border-box}</style></head><body><header><h1>Playing now — isolated pulse demo</h1><p>No move or submission needed. Alex's active board sends presence; Blair's waiting card pulses every three seconds.</p><p>Keep this page visible. Both viewers are below, so two windows are not required. Turn-changing commands are disabled in this demo. <a href="/pulse">Restart views</a></p><p id="motion"></p></header><main class="panes"><section class="pane"><h2>Alex · active player</h2><iframe title="Alex active board" src="/delayed/pulse/play/words?viewer=a"></iframe></section><section class="pane"><h2>Blair · waiting opponent</h2><iframe title="Blair waiting card" src="/delayed/pulse?viewer=b"></iframe></section></main><script>const m=matchMedia('(prefers-reduced-motion: reduce)');function show(){document.getElementById('motion').textContent=m.matches?'Reduced motion is enabled: Playing now stays static, as designed. Turn off your system reduced-motion setting to inspect the animation.':'Normal motion: watch the green glow behind Opponent’s turn / Playing now.'}m.addEventListener('change',show);show();</script></body></html>`;
const server=await createServer({configFile:false,envFile:false,cacheDir:'node_modules/.vite-pulse-preview',plugins:[react(),{name:'isolated-pulse-preview',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/'||path==='/pulse'){res.setHeader('Content-Type','text/html');res.end(page);return;}
 if(path==='/preview/events'){
  const q=new URL(req.url,'http://127.0.0.1').searchParams,viewer=q.get('viewer'),id=q.get('id'),t=q.get('topic');
  if(!['a','b'].includes(viewer)||!id||!t||t.startsWith('delayed-playing:')&&t!==topic){res.writeHead(403);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');peers.set(id,{res,viewer,topic:t});sync();req.on('close',()=>{peers.delete(id);presence.delete(id);sync();});return;
 }
 if(path==='/preview/api'){
  try{let raw='';for await(const c of req)raw+=c;const q=JSON.parse(raw),viewer=req.headers['x-preview-viewer'];if(!['a','b'].includes(viewer))throw Error('Unknown synthetic viewer');let data=null;
   if(q.name==='presence'){if(q.topic!==topic||viewer!=='a'||peers.get(q.id)?.viewer!==viewer)throw Error('Presence denied');presence.set(q.id,q.payload);sync();}
   else if(q.name==='leave'){if(peers.get(q.id)?.viewer===viewer)presence.delete(q.id);sync();}
   else if(q.name==='delayed_home')data=home(viewer);
   else if(q.name==='delayed_list')data=[home(viewer)];
   else if(q.name==='delayed_words_snapshot')data=snapshot(viewer);
   else if(q.name==='delayed_words_action')throw Error('Pulse-only demo: Alex keeps the turn. No submission is needed.');
   else if(q.name==='platform_notification_center')data={items:[],actionable:0};
   else throw Error('Unsupported pulse preview operation');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
 }
 if(path.startsWith('/delayed')){const html=await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-combined/live-preview-fixture.tsx"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return;}
 next();
});}}],resolve:{alias:[{find:'@/hooks/useAuthGuard',replacement:resolve('dev/async-combined/pulse-preview-auth.ts')},{find:'@/integrations/supabase/client',replacement:resolve('dev/async-combined/pulse-preview-transport.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15407,strictPort:true}});
await server.listen();console.log('ISOLATED pulse preview http://127.0.0.1:15407/pulse');
