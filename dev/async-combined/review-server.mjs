import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';

const root=process.cwd(),transport=resolve(root,'dev/async-combined/review-transport.ts');
const links=[['Match home','/delayed/match'],['Match list and history','/delayed'],['Winner finale','/delayed/win?finale=1'],['Loser finale','/delayed/loss?finale=1'],['Neutral draw finale','/delayed/draw?finale=1'],['Read-only draw history','/delayed/draw?history=1']];
const landing='<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Async local review</title><body style="font:18px system-ui;max-width:720px;margin:40px auto;padding:20px;background:#10202a;color:white"><h1>Async local review</h1><p>Candidate components with synthetic data. No account sign-in or production connection.</p><p>Review match home, history and winner/loser/draw finales. Gameplay, invitation creation and deletion are not connected in this preview.</p><ul>'+links.map(([label,url])=>'<li style="margin:18px"><a style="color:#8fe0de" href="'+url+'">'+label+'</a></li>').join('')+'</ul><p>The finale phrase “One authoritative match settlement” is retained for review. Finale artwork is a candidate awaiting owner acceptance.</p></body></html>';
const at=Date.now(),players=[{id:'me',name:'Hap'},{id:'other',name:'Jeremy Happach'}],viewed=new Set();
function home(id='match'){
 const terminal=id!=='match',net=id==='draw'?0:id==='loss'||/^history\d+$/.test(id)&&Number(id.slice(7))%2===0?-5:5;
 const lineup=['run21','tri-towers','quintzee','boxdrop','ptown-words'].map((game,i)=>{const delta=[5,-5,5,-5,net][i];return {id:'child'+i,ordinal:i+1,game,stake:5,terminal:terminal||i===1,actor:i%2?'other':'me',scores:{me:45780,other:terminal?(delta===0?45780:delta<0?60000:22000):i===1?null:22000},pendingResults:{other:!terminal&&i===1?1:0},progress:{me:terminal?'Complete':'Next Round: 2',other:terminal?'Complete':'Next Round: 1'},result:terminal?{winner:delta===0?null:delta>0?'me':'other',delta,reason:'normal'}:null,viewed:terminal||i!==1,expiresAt:new Date(at+36*3600000).toISOString(),lastCallAt:new Date(at+24*3600000).toISOString(),bagCount:42};});
 return {id,status:terminal?'settled':'active',revision:1,organizer:'me',opponent:'other',players,lineup,net,unsettled:terminal?0:20,exposure:25,createdAt:new Date(at).toISOString(),acceptedAt:new Date(at-86400000).toISOString(),completed:terminal?5:1,serverAt:Date.now(),realMoney:false,receipt:terminal?{match_id:id}:null,finaleViewed:viewed.has(id)};
}
function response(body){
 const {name,args={}}=body;
 if(name==='delayed_list')return [home()];
 if(name==='delayed_home'||name==='delayed_history_detail')return home(args.p_match);
 if(name==='delayed_finale_ack'){viewed.add(args.p_match);return null;}
 if(name==='delayed_history'){const rows=Array.from({length:32},(_,i)=>({id:i===0?'draw':i===1?'win':i===2?'loss':'history'+i,opponent:'Jeremy Happach',completedAt:new Date(at-i*1000).toISOString(),startedAt:new Date(at-86400000).toISOString(),count:5,net:i===0?0:i%2?5:-5,realMoney:false}));return args.p_before_id?rows.slice(30):rows.slice(0,30);}
 throw Error('This fixture preview supports match home, history and finales only.');
}
export async function createReviewServer({port=15323,preview=false}={}){
 const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'review-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
  const path=req.url?.split('?')[0];
  if(path==='/review-health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready:true,preview,fixtureOnly:true}));return;}
  if(preview&&path==='/'){res.setHeader('Content-Type','text/html');res.end(landing);return;}
  if(preview&&path==='/fixture-review-api'){
   try{let text='';for await(const chunk of req)text+=chunk;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(response(JSON.parse(text))));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}return;
  }
  if(!['/review','/review-warmup','/delayed'].includes(path)&&!path?.startsWith('/delayed/'))return next();
  const warmup=path==='/review-warmup';
  const script=warmup?'import "/dev/async-combined/review-fixture.tsx";document.body.dataset.reviewReady="true";':'import "/dev/async-combined/review-fixture.tsx";';
  try{const html=await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window.__REVIEW_PREVIEW__='+preview+'</script><script type="module">'+script+'</script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);}catch(e){next(e);}
 });}}],optimizeDeps:{include:['canvas-confetti'],entries:['dev/async-combined/review-fixture.tsx']},resolve:{alias:[{find:'@/hooks/useAuthGuard',replacement:resolve(root,'dev/async-combined/review-auth.ts')},{find:'@/integrations/supabase/client',replacement:transport},{find:'@/lib/delayed/client',replacement:transport},{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port,strictPort:true}});
 await server.listen();return server;
}
