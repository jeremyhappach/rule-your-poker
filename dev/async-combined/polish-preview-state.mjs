// Loopback-only synthetic transport. No customer or hosted state is connected.
import {initialSibling,completedSibling} from './sibling-completion-fixtures.mjs';
import {readFileSync as read} from 'node:fs';
const entries=new Map(),seenChildren=new Set(),players=[{id:'me',name:'Hap'},{id:'other',name:'Jeremy'}];
export const polishViewed=id=>seenChildren.has(id);
function entry(id){
 if(entries.has(id))return entries.get(id);const game=id.replace('turn-',''),at=Date.now();
 let initial=initialSibling(game,at);
 if(game==='tri-towers'){
  const config={...JSON.parse(read('src/lib/triTowers/rules-v2.json')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};
  initial={...initial,game,config,board:{rules:config,phase:'ready',cards:Array.from({length:28},(_,i)=>i),removed:[],waste:28,stockRemaining:23,run:0,highRun:0,score:0,deadline:at+30000,result:null}};
 }
 if(game==='quintzee')initial.board={...initial.board,scores:{},baseScore:0,rollsRemaining:2};
 initial={...initial,id,matchId:'turns',totals:{me:0,other:0},reviewRevision:0,pendingResults:{me:0,other:1}};
 const saved=game==='tri-towers'?{...initial.board,phase:'stage_complete',removed:[0,1],score:45780,result:{score:45780,scoreBefore:0,stageScore:45780,timeBonus:580,stockBonus:6000,reason:'take_score',completedAt:at}}:completedSibling(initial,at).ownResults[0].board;
 const value={initial,snapshot:{...initial,board:null},seen:false,begun:null,commands:new Map(),event:{id:'review-'+id,kind:'attempt',actor:'other',actorName:'Jeremy',round:1,score:saved.result.score,at:new Date(at).toISOString(),receipt:{game,rules:initial.config},board:saved,seen:false}};
 entries.set(id,value);return value;
}
export function polishResponse(body){
 const {name,args={}}=body;
 if(body.op==='fixture_reset'){entries.clear();seenChildren.clear();return {reset:true};}
 if(name==='delayed_reviews'&&args.p_child==='child1')return {events:[{id:'final-child1',kind:'child',actor:null,round:0,score:null,seen:seenChildren.has('child1'),receipt:{winner:'other',stake:5,game:'tri-towers'},board:null}],terminal:true,actor:'other',revision:2,segment:2,serverAt:Date.now()};
 if(name==='delayed_review_ack'&&args.p_event==='final-child1'){seenChildren.add('child1');return null;}
 if(name==='delayed_home'&&args.p_match==='turns'){
  const lineup=['run21','tri-towers','quintzee','boxdrop'].map((game,i)=>{const e=entry('turn-'+game),s=e.snapshot;return {id:s.id,ordinal:i+1,game,stake:5,terminal:false,config:s.config,actor:'me',scores:s.totals,viewed:false,expiresAt:s.expiresAt,lastCallAt:new Date(Date.now()+86400000).toISOString(),startedAt:s.board?new Date(s.serverAt).toISOString():null};});
  return {id:'turns',status:'active',players,organizer:'me',opponent:'other',lineup,net:0,revision:1,realMoney:false,serverAt:Date.now(),acceptedAt:new Date().toISOString(),createdAt:new Date().toISOString(),completed:0,exposure:20};
 }
 if(name==='delayed_reviews'&&args.p_child?.startsWith('turn-')){const e=entry(args.p_child);return {events:[{...e.event,seen:e.seen}],terminal:e.snapshot.terminal,actor:e.snapshot.actor,started:!!e.snapshot.board,segment:e.snapshot.segment,revision:e.snapshot.revision,expiresAt:e.snapshot.expiresAt,serverAt:Date.now()};}
 if(['delayed_review_begin','delayed_review_ack'].includes(name)&&args.p_event?.startsWith('review-turn-')){
  const e=entry(args.p_event.slice(7));if(name==='delayed_review_begin'){e.begun??=Date.now();return {elapsed:Date.now()-e.begun,seen:e.seen};}
  e.seen=true;e.snapshot={...e.snapshot,reviewRevision:1,totals:{...e.snapshot.totals,other:e.event.score},pendingResults:{me:0,other:0}};return null;
 }
 if(body.childId?.startsWith('turn-')){
  const e=entry(body.childId),at=Date.now();
  if(body.op==='action'){
   if(e.commands.has(body.requestId))return e.commands.get(body.requestId);
   const b=e.snapshot.board;
   if(body.intent.type==='start')e.snapshot={...e.snapshot,board:{...e.initial.board,startedAt:at,deadline:at+(e.initial.game==='tri-towers'?30000:e.initial.config.durationMs??120000)},revision:e.snapshot.revision+1};
   else if(body.intent.type==='roll')e.snapshot={...e.snapshot,board:{...b,rollSerial:b.rollSerial+1,rollsRemaining:Math.max(0,b.rollsRemaining-1)},revision:e.snapshot.revision+1};
   else if(e.snapshot.game!=='tri-towers')e.snapshot=completedSibling(e.snapshot,at);
   e.snapshot={...e.snapshot,serverAt:at};e.commands.set(body.requestId,structuredClone(e.snapshot));
  }
  return {...e.snapshot,serverAt:at};
 }
 return undefined;
}
