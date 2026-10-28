import type {Plugin} from 'vite';
import {create,project} from '../../src/lib/triTowers/referenceEngine';
import rules from '../../src/lib/triTowers/rules-v4.json';
// Loopback-only deterministic authority. No credentials, hosted URLs or DB writes.
export function incidentAuthority():Plugin {
 let route='yahtzee', revision=0, started=0, phase='intro', commands:any[]=[];
 const players=[{id:'a',userId:'u1',name:'Hap',seat:1},{id:'b',userId:'u2',name:'Lance',seat:2}];
 const state=()=>{
  const now=Date.now();
  if(route==='tri'&&phase==='intro'&&now>=started+2500){phase='ready';revision++;}
  return {route,revision,phase,commands};
 };
 return {name:'local-incident-authority',configureServer(server){server.middlewares.use('/__incident__',async(req,res,next)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')){res.statusCode=403;res.end();return;}
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
  const url=new URL(req.url!,'http://127.0.0.1');let result:any;
  state();
  if(url.pathname==='/control'){
   if(body.action==='reset'){route='yahtzee';revision=0;phase='intro';started=0;commands=[];}
   if(body.action==='select'){route='tri';started=Date.now();phase='intro';revision=0;}
   result=state();
  }else if(url.pathname==='/rpc'){
   const args=body.args??{},viewer=body.viewer??'a';
   if(args.p_action){
    if(viewer!=='a'||phase!=='ready'||args.p_revision!==revision||Date.now()>started+32500){result={data:null,error:{code:'invalid',message:'tri_towers:inactive'},status:400};}
    else{phase='playing';revision++;commands.push({viewer,action:args.p_action,revision:args.p_revision});}
   }
   if(!result){const base=project(create({sessionId:'local-session',dealerGameId:'tri-local',roundId:'round-local'},players,Array.from({length:52},(_,i)=>i),started),viewer,revision);
    result={data:{...base,rules,phase,revision,serverAt:Date.now(),deadline:started+(phase==='intro'?2500:phase==='ready'?32500:120000),canAct:viewer==='a'&&phase!=='intro'},error:null,status:200};}
  }else result=state();
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });}};
}
