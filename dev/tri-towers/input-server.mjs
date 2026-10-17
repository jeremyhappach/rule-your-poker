import {createServer} from 'vite';
// Real HTTP + actual Arcade routing; delays emulate remote hops, not production RTT.
const delay=()=>new Promise(resolve=>setTimeout(resolve,40));let operation;
const server=await createServer({server:{host:'127.0.0.1',port:8094,strictPort:true},plugins:[{name:'tri-controlled-transport',configureServer(s){s.middlewares.use('/__tri_transport',async(req,res)=>{
 try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),board=body.board;
 const projection={...board,revision:board.revision+1,removed:[...board.removed,body.intent.index],waste:board.cards[body.intent.index]};
 if(body.multiplayer){await delay();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(projection));return;}
 await delay();if(body.baseline)await delay(); // Auth and the former unused profile request.
 const rpc=async name=>{await delay();return name==='arcade_load'?{id:'00000000-0000-4000-8000-000000000002',game:'tri-towers',ruleset:'tri-towers/3'}:{outcome:'committed',projection};};
 const result=await operation(rpc,'00000000-0000-4000-8000-000000000001','Fixture',{op:'action',...(body.baseline?{}:{game:'tri-towers'}),presentationVersion:3,runId:'00000000-0000-4000-8000-000000000002',requestId:body.requestId,revision:board.revision,roundId:'r',intent:body.intent});
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}
 });}}]});
operation=(await server.ssrLoadModule('/server/arcade/service.ts')).arcadeOperation;
await server.listen();server.printUrls();
