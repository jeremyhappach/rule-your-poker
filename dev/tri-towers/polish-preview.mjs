import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
const root=process.cwd().replaceAll('\\','/'),receipts=new Map();
export const server=await createServer({configFile:false,root,cacheDir:path.join(root,'qualification.local/tri-polish/vite-cache'),plugins:[react(),{name:'local-tri-polish',configureServer(s){
 s.middlewares.use(async(req,res,next)=>{
  if(req.url==='/'||req.url?.startsWith('/?'))req.url='/dev/tri-towers/polish.html'+req.url.slice(1);
  if(req.url!=='/__tri_polish')return next();
  let body='';for await(const chunk of req)body+=chunk;
  const {command,view,reject}=JSON.parse(body);await new Promise(resolve=>setTimeout(resolve,40));
  res.setHeader('Content-Type','application/json');
  if(receipts.has(command.requestId))return res.end(receipts.get(command.requestId));
  if(reject||command.intent.type!=='remove'||view.removed.includes(command.intent.index)||Math.abs(view.cards[command.intent.index]-view.waste)!==1){res.statusCode=409;return res.end(JSON.stringify({error:'Synthetic action rejected'}));}
  const removed=[...view.removed,command.intent.index],complete=removed.length===28,now=Date.now();
  const nextView={...view,removed,waste:view.cards[command.intent.index],revision:view.revision+1,phase:complete?'stage_complete':'playing',deadline:complete?now+8000:view.deadline};
  const result=complete?{id:command.requestId,stage:1,reason:'cleared',scoreBefore:20000,score:45000,stageScore:25000,timeBonus:1000,stockBonus:12000,completedAt:now}:null;
  const json=JSON.stringify({view:nextView,result});receipts.set(command.requestId,json);res.end(json);
 });
}}],resolve:{alias:[{find:'@/lib/audio/platformAudio',replacement:root+'/dev/tri-towers/polish-audio.ts'},{find:'@',replacement:root+'/src'}]},
 define:{__BUILD_HASH__:JSON.stringify('local-tri-polish'),__BUILD_TIMESTAMP__:JSON.stringify('local'),__APP_BUILD_SHA__:JSON.stringify('local'),__APP_BUILD_TIMESTAMP__:JSON.stringify('local'),__RUN21_APP_TEST_LANE__:'false'},
 server:{host:'127.0.0.1',port:15413,strictPort:true,fs:{allow:[root,path.dirname(root+'/node_modules')]}},
});
await server.listen();console.log('Local synthetic preview: http://127.0.0.1:15413/');
