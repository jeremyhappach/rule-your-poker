import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import {randomUUID,randomInt} from 'node:crypto';
import {MegaAuthority,freshStore,rankBoard} from '../../../src/lib/megaCardGolf/authority';
import {MEGA_ANYTIME_STAND_PAT_RULESET} from '../../../src/lib/megaCardGolf/config';

// Isolated HTTP fixture: real controller/reducer, fresh memory, no production data.
const root=path.resolve(__dirname,'../../..');
const authority=new MegaAuthority(freshStore(),randomUUID,()=>{
 const cards=Array.from({length:52},(_,i)=>i);
 for(let i=51;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
 return cards;
},()=>{},MEGA_ANYTIME_STAND_PAT_RULESET);
const fixture:Plugin={name:'mega-ui-polish-local',apply:'serve',configureServer(server){
 server.middlewares.use('/__mega',async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.headers.host!=='127.0.0.1:5199'||req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5199'){res.statusCode=403;res.end('{}');return;}
  const cookie=req.headers.cookie?.match(/(?:^|; )mega_ui=([a-f0-9-]{36})(?:;|$)/)?.[1],owner=cookie??randomUUID();
  if(!cookie)res.setHeader('Set-Cookie',`mega_ui=${owner}; HttpOnly; SameSite=Strict; Path=/`);
  try{
   if(req.method!=='POST')throw Error('POST required');
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw Error('Request too large');}
   const body=JSON.parse(raw),at=Date.now();authority.tick(at);let result;
   if(body.op==='catalog')result={courses:authority.data.courses,boards:[],archives:[],active:Object.values(authority.data.runs).find(r=>r.owner===owner&&r.status==='active')?.id??null};
   else if(body.op==='leaderboard')result={rows:rankBoard(authority.data.results,body.courseId,body.boardId),self:null,personalBest:null};
   else if(body.op==='start')result=authority.start(owner,body.courseId,body.requestId,at);
   else if(body.op==='state')result=authority.state(owner,body.runId,at);
   else if(body.op==='action')result=authority.action(owner,body.runId,body.requestId,body.revision,body.hole,body.intent,at);
   else throw Error('Unsupported fixture operation');
   res.end(JSON.stringify(result));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:'Request failed'}));}
 });
}};
export default defineConfig({root,envDir:__dirname,cacheDir:path.join(__dirname,'cache.local'),plugins:[react(),fixture],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.join(root,'dev/mega-card-golf/no-production-client.ts')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:5199,strictPort:true,open:false}});
