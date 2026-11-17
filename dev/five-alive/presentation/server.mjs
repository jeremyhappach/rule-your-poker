// Actual presentation components and shared rule primitives, disposable memory
// transport. This preview does not qualify Auth, persistence, or settlement.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';

export async function startPreview(port=0){
 let rules,solo,sealed,revisions={arcade:1,async:1};const streams=new Set();
 const answers=[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CRANE',difficulty:2}];
 const valid=word=>['STARE','STONE','AMPLE','APPLE','BREAD','CRANE','PLANT','TRACE'].includes(word);
 const reset=mode=>{if(mode==='arcade')solo=rules.createSoloGame(answers);else sealed=rules.createSealedGame(['a','b'],answers);revisions[mode]++;};
 const notify=()=>{for(const stream of streams)stream.write('data: update\n\n');};
 const api={name:'five-alive-presentation-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url==='/fixture/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
  if(req.url?.startsWith('/fixture/reset?')){reset(new URL(req.url,'http://localhost').searchParams.get('mode'));notify();res.end('{}');return;}
  if(req.url!=='/fixture/request')return next();
  try{
   const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());
   const {mode,player,op,intent}=body;
   if(op==='action'){
    if(body.revision!==revisions[mode])throw new Error('Preview revision changed. Reconnect.');
    if(intent.type!=='guess')throw new Error('Use Reset preview to start again.');
    if(mode==='arcade')solo=rules.submitSoloGuess(solo,intent.word,valid);else sealed=rules.submitSealedGuess(sealed,player,intent.word,valid);
    revisions[mode]++;notify();
   }
   const view=mode==='arcade'?rules.soloProjection(solo):rules.sealedProjection(sealed,player);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:mode,revision:revisions[mode],segment:view.round,status:view.completed?'completed':'active',score:view.score,view:{...view,roundId:mode+':'+view.round}}));
  }catch(error){res.statusCode=409;res.end(JSON.stringify({error:error.message}));}
 });}};
 const client=resolve('dev/five-alive/presentation/client.ts');
 const server=await createServer({configFile:false,plugins:[react(),api],resolve:{alias:[
  {find:'@/integrations/supabase/client',replacement:client},
  {find:'@/lib/arcade/client',replacement:client},{find:'@/lib/delayed/client',replacement:client},
  {find:'@',replacement:resolve('src')},
 ]},server:{host:'127.0.0.1',port,strictPort:true},optimizeDeps:{entries:['dev/five-alive/presentation/index.html']}});
 rules=await server.ssrLoadModule('/server/fiveAlive/rules.ts');reset('arcade');reset('async');await server.listen();
 return {server,url:`http://127.0.0.1:${server.httpServer.address().port}/dev/five-alive/presentation/index.html`};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const preview=await startPreview(5184);console.log(preview.url);
}
