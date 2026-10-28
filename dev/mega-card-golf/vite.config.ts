import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {randomInt,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {MegaAuthority,freshStore,rankBoard} from '../../src/lib/megaCardGolf/authority';
import {COURSE_IDS} from '../../src/lib/megaCardGolf/config';
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dev/mega-card-golf/state.local'),file=path.join(dir,'store.json');
export function localAuthority():Plugin {return {name:'mega-local-only',apply:'serve',configureServer(server){
 mkdirSync(dir,{recursive:true});
 const authority=new MegaAuthority(existsSync(file)?JSON.parse(readFileSync(file,'utf8')):freshStore(),randomUUID,()=>{
  const deck=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;
 },data=>{writeFileSync(file+'.tmp',JSON.stringify(data));renameSync(file+'.tmp',file);});
 let timer:ReturnType<typeof setTimeout>;
 const schedule=()=>{clearTimeout(timer);const dates=Object.values(authority.data.runs).filter(r=>r.status==='active').map(r=>r.deadline);if(dates.length)timer=setTimeout(()=>{authority.tick(Date.now());schedule();},Math.max(1,Math.min(...dates)-Date.now()));};
 authority.tick(Date.now());schedule();server.httpServer?.once('close',()=>clearTimeout(timer));
 server.middlewares.use('/__mega',async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(!req.socket.remoteAddress?.match(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/)||req.headers.host!=='127.0.0.1:5187'||req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5187'){res.statusCode=403;res.end('{}');return;}
  const cookie=req.headers.cookie?.match(/(?:^|; )mega_preview=([a-f0-9-]{36})(?:;|$)/)?.[1],owner=cookie??randomUUID();
  if(!cookie)res.setHeader('Set-Cookie',`mega_preview=${owner}; HttpOnly; SameSite=Strict; Path=/`);
  try{
   if(req.method!=='POST')throw Error('POST required');
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw Error('Request too large');}
   const b=JSON.parse(body),at=Date.now();authority.tick(at);let result:unknown;
   if(b.op==='catalog')result={isAdmin:true,courses:authority.data.courses,boards:authority.data.courses.map(c=>({id:c.id,rows:rankBoard(authority.data.results,c.id,c.boardId)})),archives:authority.data.configs.filter((c,i,a)=>c.boardId!==authority.data.courses.find(x=>x.id===c.id)?.boardId&&a.findIndex(x=>x.boardId===c.boardId)===i).map(c=>({config:c,rows:rankBoard(authority.data.results,c.id,c.boardId)})),active:Object.values(authority.data.runs).find(r=>r.owner===owner&&r.status==='active')?.id??null};
   else if(b.op==='leaderboard'){
    const course=authority.data.courses.find(c=>c.id===b.courseId);if(!course)throw Error('Unknown course');
    const boardId=b.boardId??course.boardId,eligible=authority.data.results.filter(r=>b.window==='all'||r.completedAt>=at-30*86400000),rows=rankBoard(eligible,course.id,boardId);
    const personal=rankBoard(authority.data.results.filter(r=>r.owner===owner),course.id,boardId);
    result={id:course.id,boardId,rows:rows.slice(0,10),self:rows.find(r=>r.owner===owner)??null,personalBest:personal[0]?.score??null};
   }
   else if(b.op==='state')result=authority.state(owner,b.runId,at);
   else if(b.op==='defaults')result=authority.saveCourse(b.id,b.revision,b.settings,b.boardChoice);
   else {
    if(typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw Error('Invalid request identity');
    if(b.op==='start'&&COURSE_IDS.includes(b.courseId))result=authority.start(owner,b.courseId,b.requestId,at);
    else if(b.op==='action')result=authority.action(owner,b.runId,b.requestId,b.revision,b.hole,b.intent,at);
    else throw Error('Unknown operation');
   }
   schedule();res.end(JSON.stringify(result));
  }catch(error){schedule();res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'Request failed'}));}
 });
}};}
export default defineConfig({root,cacheDir:path.join(root,'dev/mega-card-golf/cache.local'),envDir:path.join(root,'dev/mega-card-golf'),plugins:[react(),localAuthority()],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.join(root,'dev/mega-card-golf/no-production-client.ts')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:5187,strictPort:true,open:false},build:{outDir:'dist/mega-card-golf-preview',rollupOptions:{input:path.join(root,'dev/mega-card-golf/index.html')}}});
