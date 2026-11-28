import {transition,project,gameplayDue,type Child,type Rpc,type Intent} from './adapter.js';
type Row=Child&{receipt?:{child_id:string;fingerprint:unknown}|null};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const due=(r:Row)=>{const board=r.state?gameplayDue(r.state):null;return r.game_type==='quintzee'&&board!==null?board:Math.min(Date.parse(r.expires_at),board??Infinity);};
export async function synchronizeSealed(rpc:Rpc,input:Row,viewer:string):Promise<Row>{
 let row=input;
 for(let guard=0;guard<128;guard++){
  if(row.terminal||row.held||row.actor!==viewer||due(row)>Number(row.server_at))return row;
  const next=await transition(row,{type:'tick'},rpc);
  const result=await rpc('delayed_sealed_commit',{p_child:row.id,p_actor:viewer,p_revision:row.revision,p_state:next.state,p_event:'tick',p_at:next.at,p_advanced:next.advanced});
  row=result.record;
 }
 throw Error('delayed:recovery_incomplete');
}
/** Each player carries an independent board and command history. A peer-only
 * revision change may be retried; a change to this player's state never is. */
export async function sealedOperation(rpc:Rpc,userId:string,body:Record<string,any>,loaded?:Row){
 let row=loaded??await rpc('delayed_sealed_load',{p_child:body.childId,p_actor:userId,p_request:body.op==='action'?body.requestId:null}) as Row;
 if(!row.sealed)throw Error('delayed:wrong_flow');
 const fingerprint={child:body.childId,revision:body.revision,segment:body.segment,intent:body.intent};
 if(row.receipt){if(row.receipt.child_id!==body.childId||!same(row.receipt.fingerprint,fingerprint))throw Error('delayed:request_conflict');return project(row,userId,rpc);}
 row=await synchronizeSealed(rpc,row,userId);
 if(body.op==='state')return project(row,userId,rpc);
 const intent=body.intent as Intent;
 for(let attempt=0;attempt<5;attempt++){
  if(row.held||row.terminal||row.actor!==userId||row.segment!==body.segment||body.revision>row.revision||body.revision<(row.partRevision??row.revision))throw Error('delayed:stale_action');
  const bonus=intent.type==='bonus_play'||intent.type==='bonus_skip';
  if(bonus&&(row.state?.optionalBonus?.actor!==userId||row.state.optionalBonus.choice!=='pending'))throw Error('delayed:bonus_unavailable');
  const next=bonus?{state:{...row.state!,optionalBonus:{actor:userId,choice:intent.type==='bonus_play'?'play':'skip'}},at:Number(row.server_at),advanced:false}:await transition(row,intent,rpc);
  const result=await rpc('delayed_sealed_commit',{p_child:row.id,p_actor:userId,p_revision:row.revision,p_state:next.state,p_event:'action',p_at:next.at,p_advanced:next.advanced,p_request:body.requestId,p_fingerprint:fingerprint});
  if(result.outcome==='committed'||result.outcome==='duplicate')return project(result.record,userId,rpc);
  row=await synchronizeSealed(rpc,result.record,userId);
 }
 throw Error('delayed:stale_action');
}
export async function recoverSealed(rpc:Rpc,row:Child){
 for(const viewer of [row.organizer,row.opponent]){
  const loaded=await rpc('delayed_sealed_load',{p_child:row.id,p_actor:viewer,p_recovery:true});
  if(!loaded.terminal)await synchronizeSealed(rpc,loaded,viewer);
 }
 return row;
}
