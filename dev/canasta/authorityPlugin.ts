import type {Plugin} from 'vite';
import {createMatch,project,execute,startHand,expire,takeControl,resume,type Command} from '../../src/lib/canasta/engine';
import {chooseBotAction} from '../../src/lib/canasta/bot';
import {secureDeck} from '../../server/canasta/shuffle';
import {randomUUID} from 'node:crypto';
import type {ServerResponse} from 'node:http';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
/** Explicit loopback fixture. Real reducer and private projection; no database or financial writes. */
export function canastaAuthorityFixture():Plugin{
 let offset=0;const now=()=>Date.now()+offset;
 let match=startHand(createMatch({id:id(1),sessionId:id(2),stake:10,realMoney:false,seats:[
  {id:id(3),userId:id(5),kind:'human',seat:1},{id:id(4),userId:id(6),kind:'human',seat:5},
 ]},Date.now()),id(7),secureDeck(),Date.now());
 const clients=new Set<ServerResponse>();const notify=()=>clients.forEach(res=>res.write('data: revision\n\n'));
 return {name:'canasta-authority-fixture',configureServer(server){
  server.middlewares.use('/__canasta-fixture',async(req,res,next)=>{
   const url=new URL(req.url??'/','http://fixture.invalid');if(!['/state','/action','/events','/opponent','/expire','/take-control','/resume'].includes(url.pathname))return next();
   // Fixture tokens identify the two synthetic seats only, never real users.
   const viewer=url.searchParams.get('viewer')==='2'?id(4):id(3),user=viewer===id(3)?id(5):id(6);
   const snapshot=()=>({state:project(match,viewer),serverAt:now(),firstRoundId:id(7),settlement:null,finished:false});
   if(url.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write('data: ready\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
   const send=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
   try{
    if(url.pathname==='/state')return send(200,snapshot());
    if(req.method!=='POST')return send(405,{error:'Fixture requires POST'});
    if(url.pathname==='/expire'){
     offset=Math.max(offset,match.hand!.deadline-Date.now());match=expire(match,now(),match.seats.filter(s=>!match.automatic.includes(s.id)).map(s=>s.id));
    }else if(url.pathname==='/take-control'){
     match=takeControl(match,viewer,{kind:'human',userId:user},now());
    }else if(url.pathname==='/resume'){
     if(match.pause)match=resume(match,now(),match.pause.episode);
    }else if(url.pathname==='/opponent'){
     // Explicit test-driver action, never used for a human timeout.
     for(let i=0;i<3&&match.hand?.active!==viewer&&!match.winner;i++){
      const h=match.hand!;if(h.phase==='complete'){match=startHand(match,randomUUID(),secureDeck(),now());break;}
      const action=chooseBotAction(project(match,h.active));if(!action)break;
      match=execute(match,{matchId:match.id,handId:h.id,turn:h.turn,generation:h.generation,revision:match.revision,requestId:randomUUID(),playerId:h.active,action},{kind:'service'},now()).state;
     }
    }else{
     let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)return send(413,{error:'Fixture request too large'});}
     match=execute(match,JSON.parse(body) as Command,{kind:'human',userId:user},now()).state;
    }
    notify();return send(200,snapshot());
   }catch(e){return send(409,{error:(e as Error).message});}
  });
  server.httpServer?.on('close',()=>clients.forEach(res=>res.end()));
 }};
}
