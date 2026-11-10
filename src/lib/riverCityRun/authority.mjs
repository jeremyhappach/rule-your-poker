import {freshState,step,act,scoreFor,createCasino,beginDeal,blackjackAct,advanceCasino,nextDeal,leaveCasino,money} from './core.mjs';

export const GAME='river-city-run', COURSE_ID='the-boat', RULESET='river-city-run/1';
export const INPUT_GRACE_MS=2000;
const clone=x=>structuredClone(x);
const reject=reason=>{throw Error('arcade:'+reason);};
const directions=new Set(['up','down','left','right']);

// The server and optimistic road renderer consume the same frozen simulation.
// Only inputs cross the API: clients never submit scores, pickups, collisions or decks.
export function createRun(id,owner,at){
 const road=freshState();road.phase='running';
 return {id,owner,ruleset:RULESET,config:{id:COURSE_ID,version:RULESET},status:'active',startedAt:at,updatedAt:at,road,casino:null,score:0,deadline:at+INPUT_GRACE_MS+1000,decisionAt:null,waitingSince:null};
}
function advanceRoad(road,target){
 if(!Number.isFinite(target)||target<road.t-1e-8)reject('stale_input');
 target=Math.min(186,target);
 while(road.t<target-1e-9&&['running','approach','arrival'].includes(road.phase))step(road,Math.min(1/120,target-road.t));
 if(road.t<target&&['running','approach','arrival'].includes(road.phase))step(road,target-road.t);
}
function finalize(run,score){run.status='completed';run.score=money(score);run.deadline=null;run.road.finalScore=run.score;}
function clockRun(run,at){
 if(run.road.phase==='crashed'){finalize(run,scoreFor(run.road).total);return;}
 if(run.road.phase==='finished'&&!run.casino){run.decisionAt??=run.startedAt+186000;run.deadline=run.decisionAt+300000;return;}
 if(run.casino){
  const c=run.casino;
  if(c.phase==='closed'){finalize(run,c.balance);return;}
  const animation=!['betting','playing','settled'].includes(c.phase)||c.phase==='playing'&&c.actionDelay>0;
  if(animation)run.waitingSince=null;else run.waitingSince??=at;
  run.deadline=animation?at+Math.max(1,Math.ceil((c.phase==='playing'?c.actionDelay:c.wait)*1000)):run.waitingSince+300000;
  return;
 }
 run.deadline=at+INPUT_GRACE_MS+1000;
}
export function recoverRun(input,at){
 const r=clone(input);if(r.status!=='active')return r;
 if(!Number.isFinite(at)||at<r.updatedAt)reject('invalid_clock');
 if(r.casino){
  let remaining=(at-r.updatedAt)/1000;
  while(remaining>1e-9&&!['betting','settled','closed'].includes(r.casino.phase)){
   if(r.casino.phase==='playing'&&r.casino.actionDelay<=0)break;
   const dt=Math.min(remaining,1/120);advanceCasino(r.casino,dt);remaining-=dt;
  }
 }else advanceRoad(r.road,Math.max(r.road.t,(at-r.startedAt-INPUT_GRACE_MS)/1000));
 // An unattended decision expires unranked; no synthetic wager or player choice.
 if(r.deadline!==null&&at>=r.deadline&&(
   r.road.phase==='finished'&&!r.casino||r.casino&&['betting','settled','playing'].includes(r.casino.phase)&&r.casino.actionDelay<=0
 )&&at-(r.waitingSince??r.decisionAt??at)>=300000){r.status='abandoned';r.deadline=null;}
 r.updatedAt=at;if(r.status==='active')clockRun(r,at);return r;
}
export function applyIntent(input,intent,at,shoeFactory){
 if(input.status!=='active')reject('terminal_run');
 if(!intent||typeof intent!=='object'||Array.isArray(intent))reject('invalid_action');
 let r;
 if(intent.type==='input'){
  if(!directions.has(intent.direction)||!Number.isFinite(intent.at))reject('invalid_input');
  if(input.casino||input.road.phase!=='running')reject('road_closed');
  const wall=(at-input.startedAt)/1000;
  if(intent.at>wall+.1||intent.at<wall-INPUT_GRACE_MS/1000||intent.at<input.road.t-1e-8)reject('stale_input');
  r=clone(input);advanceRoad(r.road,intent.at);
  if(r.road.phase!=='running')reject('road_closed');
  if(!act(r.road,intent.direction))reject('illegal_input');r.updatedAt=at;clockRun(r,at);return r;
 }
 r=recoverRun(input,at);
 if(r.status!=='active')return r;
 if(intent.type==='abandon'){r.status='abandoned';r.deadline=null;return r;}
 if(intent.type==='bank'||intent.type==='inside'){
  if(r.road.phase!=='finished'||r.casino)reject('arrival_required');
  if(intent.type==='bank')finalize(r,scoreFor(r.road).total);
  else{r.casino=createCasino(scoreFor(r.road).total);r.road.phase='casino';clockRun(r,at);}
  return r;
 }
 const c=r.casino;if(!c)reject('casino_required');
 let accepted=false;
 if(intent.type==='deal'){
  if(typeof shoeFactory!=='function')reject('server_shoe_required');
  accepted=beginDeal(c,intent.wager,shoeFactory());
 }else if(['hit','stand','double'].includes(intent.type))accepted=blackjackAct(c,intent.type);
 else if(intent.type==='again')accepted=nextDeal(c);
 else if(intent.type==='leave')accepted=leaveCasino(c);
 if(!accepted)reject('illegal_action');
 clockRun(r,at);return r;
}
export function projectRun(input,at,revision=0){
 const r=clone(input);
 if(r.casino){
  delete r.casino.shoe;
  // Even the hidden rank is absent from the wire, not merely covered by a back.
  if(!r.casino.holeRevealed&&r.casino.dealer.length>1)r.casino.dealer[1]={hidden:true};
 }
 return {...r,serverAt:at,revision};
}
