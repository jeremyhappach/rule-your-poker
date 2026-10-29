import {isUuid} from '../../src/lib/run21/model.js';
import {transition,project,gameplayDue,type Child,type Rpc,type Intent} from './adapter.js';
type RecordRow=Child&{held:boolean;receipt?:{child_id:string;fingerprint:unknown}|null};
const due=(row:Child)=>Math.min(Date.parse(row.expires_at),row.state?gameplayDue(row.state)??Infinity:Infinity);
export async function synchronize(rpc:Rpc,input:RecordRow,actor:string|null):Promise<RecordRow>{
 let row=input;
 for(let guard=0;guard<8;guard++){
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
 if(body.op==='action'&&(!intent||!['start','place','pass','collect','remove','draw','take_score','recycle','roll','score','score_zero'].includes(intent.type)||
  intent.type==='place'&&(!('items'in intent)&&(!Number.isInteger(intent.column)||intent.column<0||intent.column>4))||
  intent.type==='remove'&&(!Number.isInteger(intent.index)||intent.index<0||intent.index>27)))throw Error('delayed:invalid_action');
 let row:RecordRow=await rpc('delayed_load',{p_child:body.childId,p_actor:userId,p_request:body.op==='action'?body.requestId:null});
 if(body.op==='action'){
  if('items'in intent&&(!Array.isArray(intent.items)||intent.items.length>5||intent.items.some(i=>!Number.isInteger(i)||i<0||i>2147483647)))throw Error('delayed:invalid_items');
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
  const next=await transition(row,intent,rpc);
  const result=await rpc('delayed_commit',{p_child:row.id,p_actor:userId,p_revision:row.revision,p_state:next.state,
   p_event:'action',p_at:next.at,p_advanced:next.advanced,p_request:body.requestId,p_fingerprint:fingerprint});
  if(!['committed','duplicate'].includes(result.outcome)){
   await synchronize(rpc,result.record,userId);throw Error('delayed:stale_action');
  }
  row={...result.record,reviewed:row.reviewed};
 }
 return project(row,userId,rpc);
}
function canonical(value:any):any{
 return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
}
