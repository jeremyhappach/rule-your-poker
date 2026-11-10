import {isUuid} from '../../src/lib/run21/model.js';
import {transition,project,gameplayDue,type Child,type Rpc,type Intent} from './adapter.js';
type RecordRow=Child&{held:boolean;receipt?:{child_id:string;fingerprint:unknown}|null};
const due=(row:Child)=>Math.min(Date.parse(row.expires_at),row.state?gameplayDue(row.state)??Infinity:Infinity);
export async function synchronize(rpc:Rpc,input:RecordRow,actor:string|null):Promise<RecordRow>{
 let row=input;
 for(let guard=0;guard<(input.game_type==='crib-lab'||input.game_type==='chucky-showdown'?128:8);guard++){
  if(row.terminal||row.held||due(row)>Number(row.server_at))return row;
  const next=await transition(row,{type:'tick'},rpc);
  const result=await rpc('delayed_commit',{p_child:row.id,p_actor:actor,p_revision:row.revision,p_state:next.state,
   p_event:'tick',p_at:next.at,p_advanced:next.advanced});
  row={...result.record,reviewed:row.reviewed};
 }
 throw Error('delayed:recovery_incomplete');
}
export async function delayedOperation(rpc:Rpc,userId:string,body:Record<string,any>){
 if(!['state','action'].includes(body.op)||!isUuid(body.childId??''))throw Error('delayed:invalid_request');
 if(body.op==='action'&&(!isUuid(body.requestId??'')||!Number.isSafeInteger(body.revision)||!Number.isSafeInteger(body.segment)))throw Error('delayed:invalid_command');
 const intent=body.intent as Intent;
 if(body.op==='action'&&(!intent||!['start','place','pass','collect','remove','draw','take_score','recycle','roll','score','score_zero','pair','open','replace','discard','stand-pat','select','lock','swap','stand','fold','stay','press','bonus_play','bonus_skip'].includes(intent.type)||
  intent.type==='place'&&(!('items'in intent)&&(!Number.isInteger(intent.column)||intent.column<0||intent.column>4))||
  intent.type==='remove'&&(!Number.isInteger(intent.index)||intent.index<0||intent.index>27)))throw Error('delayed:invalid_action');
 // A routing hint grants no authority: SQL checks the stored game, owner, frozen
 // revision/segment, deadlines and receipt before calling the existing commit.
 if(body.op==='action'&&(intent.type==='bonus_play'||intent.type==='bonus_skip')){
  const row=await rpc('delayed_bonus_choice',{p_child:body.childId,p_actor:userId,p_request:body.requestId,p_revision:body.revision,p_segment:body.segment,p_choice:intent.type==='bonus_play'?'play':'skip'});
  // Return the same projection owner as ordinary TriTowers refreshes, including
  // review disclosure and equal-revision serialization.
  if(row.game_type==='tri-towers')return rpc('delayed_tri_bonus_step',{p_child:body.childId,p_actor:userId});
  return project(row,userId,rpc);
 }
 if(body.game==='tri-towers'){
  const value=await rpc('delayed_tri_bonus_step',{p_child:body.childId,p_actor:userId,...(body.op==='action'?{p_request:body.requestId,p_revision:body.revision,p_segment:body.segment,p_intent:intent}:{})});
  // Returning the stale result allows a due tick to commit before rejection.
  if(value.error)throw Error(value.error);
  return value as Awaited<ReturnType<typeof project>>;
 }
 let boundary:RecordRow|undefined;
 let reduced:Record<string,unknown>|undefined;
 if(body.op==='action'&&intent.type!=='start'&&['take-two','quintzee','boxdrop'].includes(body.game)){
  const step=await rpc('delayed_board_action',{p_child:body.childId,p_actor:userId,p_game:body.game,p_request:body.requestId,p_revision:body.revision,p_segment:body.segment,p_intent:intent});
  if(step.record)return project(step.record,userId,rpc,step);
  boundary=step.boundary;
  reduced=step.reduced;
 }
 let row:RecordRow=boundary??await rpc('delayed_load',{p_child:body.childId,p_actor:userId,p_request:body.op==='action'?body.requestId:null});
 if(body.op==='action'){
  if(intent.type==='replace'&&row.game_type!=='crib-lab'&&(!('index'in intent)||!Number.isInteger(intent.index)||intent.index<0||intent.index>5))throw Error('delayed:invalid_action');
  if(row.game_type==='chucky-showdown'&&intent.type==='press'&&(!Number.isInteger(intent.level)||intent.level!<1||intent.level!>7))throw Error('delayed:invalid_level');
  if(intent.type==='open'&&(!Array.isArray(intent.indices)||intent.indices.length<1||intent.indices.length>5||new Set(intent.indices).size!==intent.indices.length||intent.indices.some(i=>!Number.isInteger(i)||i<0||i>5)))throw Error('delayed:invalid_action');
  if('items'in intent&&(!Array.isArray(intent.items)||intent.items.length>5||intent.items.some(i=>!Number.isInteger(i)||i<(row.game_type==='take-two'&&intent.type==='pair'?-1:0)||i>2147483647)))throw Error('delayed:invalid_items');
  if(intent.type==='pair'&&(row.game_type!=='take-two'||!('items'in intent)||intent.items.length!==2||new Set(intent.items).size!==2||intent.items.some(i=>i>32)))throw Error('delayed:invalid_items');
  if(row.game_type==='run21'&&intent.type==='place'&&!('column'in intent))throw Error('delayed:invalid_action');
  if((row.game_type==='boxdrop'&&['place','recycle'].includes(intent.type)||row.game_type==='quintzee'&&['roll','score','score_zero'].includes(intent.type))&&!('items'in intent))throw Error('delayed:invalid_items');
 }
 const fingerprint=body.op==='action'?{child:body.childId,revision:body.revision,segment:body.segment,intent}:null;
 if(row.receipt){
  if(row.receipt.child_id!==body.childId||JSON.stringify(canonical(row.receipt.fingerprint))!==JSON.stringify(canonical(fingerprint)))throw Error('delayed:request_conflict');
  return project(row,userId,rpc);
 }
 row=await synchronize(rpc,row,userId);
 if(body.op==='action'){
  if(row.held)throw Error('delayed:held');
  if(row.terminal||row.actor!==userId||row.revision!==body.revision||row.segment!==body.segment)throw Error('delayed:stale_action');
  const next=await transition(row,intent,(name,args)=>{
   if(reduced && args.p_operation==='reduce'){
    const board=reduced;
    reduced=undefined;
    return Promise.resolve(board);
   }
   return rpc(name,args);
  });
  const result=await rpc('delayed_commit',{p_child:row.id,p_actor:userId,p_revision:row.revision,p_state:next.state,
   p_event:'action',p_at:next.at,p_advanced:next.advanced,p_request:body.requestId,p_fingerprint:fingerprint});
  if(!['committed','duplicate'].includes(result.outcome)){
   await synchronize(rpc,result.record,userId);throw Error('delayed:stale_action');
  }
  row={...result.record,reviewed:row.reviewed};
 }
 // Initial reads without a routing hint must use the same projection owner as
 // later hinted refreshes; equal revisions cannot gain a different key shape.
 if(row.game_type==='tri-towers')return rpc('delayed_tri_bonus_step',{p_child:body.childId,p_actor:userId});
 return project(row,userId,rpc);
}
function canonical(value:any):any{
 return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
}
