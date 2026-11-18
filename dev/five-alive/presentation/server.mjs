// Actual presentation components and shared rule primitives, disposable memory
// transport. This preview does not qualify Auth, persistence, or settlement.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';

export async function startPreview(port=0,options={}){
 let rules,solo,sealed,revisions={arcade:1,async:1};const streams=new Set(),seen=new Set();let reviewRevision=1;
 const answers=options.answers??[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CRANE',difficulty:2}];
 const valid=word=>['STARE','STONE','AMPLE','APPLE','BREAD','CRANE','PLANT','TRACE',...(options.valid??[])].includes(word);
 const reset=mode=>{if(mode==='arcade')solo=rules.createSoloGame(answers);else {sealed=rules.createSealedGame(['a','b'],answers);seen.clear();reviewRevision++;}revisions[mode]++;};
 const demo=kind=>{
  if(/^solve[1-6]$/.test(kind)){reset('arcade');for(let i=1;i<Number(kind.at(-1));i++)solo=rules.submitSoloGuess(solo,'STARE',valid);revisions.arcade++;return;}
  if(!['keyboard','award','results','opponent','sixth'].includes(kind))throw Error('Unknown preview');
  if(kind==='keyboard'||kind==='award'){reset('arcade');solo=rules.submitSoloGuess(solo,'STARE',valid);if(kind==='award')solo=rules.submitSoloGuess(solo,'AMPLE',valid);revisions.arcade++;return;}
  reset('async');for(const word of ['STARE','APPLE'])sealed=rules.submitSealedGuess(sealed,'a',word,valid);
  for(const word of kind==='sixth'?Array(5).fill('PLANT'):['PLANT','TRACE'])sealed=rules.submitSealedGuess(sealed,'b',word,valid);
  if(kind==='results'){sealed=rules.submitSealedGuess(sealed,'b','APPLE',valid);seen.add('review:1:a');seen.add('review:1:b');for(const word of ['TRACE','BREAD'])sealed=rules.submitSealedGuess(sealed,'a',word,valid);}
  revisions.async++;
 };
 const notify=()=>{for(const stream of streams)stream.write('data: update\n\n');};
 const api={name:'five-alive-presentation-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url==='/fixture/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
  if(req.url?.startsWith('/fixture/reset?')){reset(new URL(req.url,'http://localhost').searchParams.get('mode'));notify();res.end('{}');return;}
  if(req.url?.startsWith('/fixture/demo?')){try{demo(new URL(req.url,'http://localhost').searchParams.get('case'));notify();res.end('{}');}catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}return;}
  if(req.url!=='/fixture/request')return next();
  try{
   const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());
   const {mode,player,op,intent}=body;
   if(op==='delayed_review_begin'||op==='delayed_review_ack'){
    const event=String(body.p_event),round=Number(event.split(':')[1]);if(!['a','b'].includes(player)||!event.endsWith(':'+player)||round<1||round>sealed.current)throw Error('Unauthorized review');
    if(op==='delayed_review_ack'){seen.add(event);reviewRevision++;notify();}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({seen:seen.has(event)}));return;
   }
   if(op==='action'){
    if(body.revision!==revisions[mode])throw new Error('Preview revision changed. Reconnect.');
    if(intent.type!=='guess')throw new Error('Use Reset preview to start again.');
    if(mode==='arcade')solo=rules.submitSoloGuess(solo,intent.word,valid);else sealed=rules.submitSealedGuess(sealed,player,intent.word,valid);
    revisions[mode]++;notify();
   }
   const view=mode==='arcade'?rules.soloProjection(solo):rules.sealedProjection(sealed,player);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:mode,revision:revisions[mode],reviewRevision,wordReviews:mode==='async'?Array.from({length:sealed.current},(_,i)=>({id:'review:'+(i+1)+':'+player,round:i+1,seen:seen.has('review:'+(i+1)+':'+player)})):[],segment:view.round,status:view.completed?'completed':'active',score:view.score,view:{...view,roundId:mode+':'+view.round}}));
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
