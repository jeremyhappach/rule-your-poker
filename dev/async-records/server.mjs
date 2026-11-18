import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const root=process.cwd(),calls=[];
let recordFixture;
const fixture={name:'record-fixture',configureServer(server){
 server.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/fixture/')){
   let body='';for await(const chunk of req)body+=chunk;
   const name=req.url.slice('/fixture/'.length),args=body?JSON.parse(body):{};
   calls.push(name);res.setHeader('Content-Type','application/json');
   if(name==='calls'){res.end(JSON.stringify(calls));return;}
   if(name==='delayed_history'){res.end(JSON.stringify({data:[{id:'match',opponent:'Opponent',count:11,net:5,completedAt:'2026-11-17T20:00:00Z',startedAt:'2026-11-17T18:00:00Z',realMoney:false}],error:null}));return;}
   if(name==='delayed_match_record'){res.end(JSON.stringify({data:recordFixture(args.p_child??undefined),error:null}));return;}
   res.statusCode=400;res.end(JSON.stringify({error:{message:'Unexpected RPC '+name}}));return;
  }
  if(req.url?.startsWith('/delayed/')||req.url==='/')req.url='/dev/async-records/index.html';
  next();
 });
}};
const server=await createServer({
 configFile:false,root,plugins:[react(),fixture],server:{host:'127.0.0.1',port:5198,strictPort:true},
 resolve:{alias:[
  {find:'@/integrations/supabase/client',replacement:resolve('dev/async-records/supabase.ts')},
  {find:'@',replacement:resolve('src')},
 ]},
});
({recordFixture}=await server.ssrLoadModule('/src/lib/delayed/matchRecord.fixture.ts'));
await server.listen();console.log('Read-only record browser fixture: http://127.0.0.1:5198');
