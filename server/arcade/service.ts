import {createSoloRun,advanceSolo,applySolo,nextDue,soloProjection} from '../../src/lib/arcade/run21.js';
import {isUuid} from '../../src/lib/run21/model.js';
import type {ArcadeIntent,RunRecord} from '../../src/lib/arcade/model.js';
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<any>;
export async function synchronize(rpc:Rpc,input:RunRecord,actor:string|null,token:string|null=null):Promise<RunRecord>{
 if(input.game==='tri-towers')return (await rpc('arcade_tri_step',{p_actor:actor,p_run:input.id,p_token:token})).record;
 let row=input;
 for(let attempt=0;attempt<3;attempt++){
  if(row.status!=='active')return row;
  const state=row.state??createSoloRun(row,Date.parse(row.created_at));
  const next=advanceSolo(state,Number(row.server_at));
  if(row.state&&JSON.stringify(next)===JSON.stringify(row.state))return row;
  const value=await rpc('arcade_commit',{p_actor:actor,p_run:row.id,p_revision:row.revision,p_state:next,p_due:nextDue(next),p_token:token});
  row={...value.record,server_at:row.server_at};
  if(value.outcome!=='conflict')return row;
 }
 throw Error('arcade:concurrent_action');
}
export async function arcadeOperation(rpc:Rpc,userId:string,name:string,body:Record<string,any>){
 if(body.op==='leaderboard')return rpc('arcade_leaderboard',{p_actor:userId,p_game:body.game,p_window:body.window,p_result:body.result??null,...(body.ruleset?{p_ruleset:body.ruleset}:{})});
 if(!['start','state','action'].includes(body.op))throw Error('arcade:invalid_operation');
 if(body.op==='start'&&!isUuid(body.requestId))throw Error('arcade:invalid_request');
 if(body.op!=='start'&&!isUuid(body.runId))throw Error('arcade:invalid_run');
 let row:RunRecord&{receipt?:{fingerprint:string;run_id:string}}=body.op==='start'?
  await rpc('arcade_start',{p_actor:userId,p_request:body.requestId,p_game:body.game}):
  await rpc('arcade_load',{p_actor:userId,p_run:body.runId,p_request:body.op==='action'?body.requestId:null});
 if(row.game==='tri-towers'){
  if(body.op==='action'&&(!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||typeof body.roundId!=='string'||!body.intent||!['remove','draw','take_score','abandon'].includes(body.intent.type)||body.intent.type==='remove'&&!Number.isInteger(body.intent.index)))throw Error('arcade:invalid_command');
  const result=await rpc('arcade_tri_step',{p_actor:userId,p_run:row.id,...(body.op==='action'?{p_revision:body.revision,p_round:body.roundId,p_request:body.requestId,p_action:body.intent.type,p_index:body.intent.type==='remove'?body.intent.index:null}:{})});
  if(result.outcome==='stale')throw Error('arcade:stale_action');
  return result.projection;
 }
 const receipt=row.receipt;
 row=await synchronize(rpc,row,userId);
 if(body.op==='action'){
  if(!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||typeof body.roundId!=='string')throw Error('arcade:invalid_command');
  const intent=body.intent as ArcadeIntent;
  if(!intent||!['place','pass','collect','abandon'].includes(intent.type))throw Error('arcade:invalid_action');
  const fingerprint=JSON.stringify([body.runId,body.revision,body.roundId,intent.type,intent.type==='place'?intent.column:null]);
  if(receipt){
   if(receipt.run_id!==row.id||receipt.fingerprint!==fingerprint)throw Error('arcade:request_conflict');
  }else{
   if(row.revision!==body.revision||row.state?.roundId!==body.roundId)throw Error('arcade:stale_action');
   const state=applySolo(row.state!,intent,Number(row.server_at));
   const committed=await rpc('arcade_commit',{p_actor:userId,p_run:row.id,p_revision:row.revision,p_state:state,p_due:nextDue(state),p_request:body.requestId,p_fingerprint:fingerprint});
   if(committed.outcome==='deadline'){
    await synchronize(rpc,committed.record,userId);
    throw Error('arcade:stale_action');
   }
   if(committed.outcome==='conflict')throw Error('arcade:stale_action');
   row={...committed.record,server_at:row.server_at};
  }
 }
 return soloProjection(row,name,Number(row.server_at));
}
export async function recoverArcade(rpc:Rpc,token:string){
 const runs:RunRecord[]=await rpc('arcade_recovery_claim',{p_token:token});
 let failure:string|null=null;
 try{for(const run of runs)await synchronize(rpc,run,null,token);}
 catch{failure='arcade:recovery_failed';}
 await rpc('arcade_recovery_complete',{p_token:token,p_failure:failure});
 if(failure)throw Error(failure);
 return runs.length;
}

