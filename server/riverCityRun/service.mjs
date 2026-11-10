import {GAME,COURSE_ID,RULESET,createRun,recoverRun,applyIntent,projectRun} from '../../src/lib/riverCityRun/authority.mjs';
import {shuffledShoe} from './shuffle.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const valid=r=>{if(r.game!==GAME||r.ruleset!==RULESET||r.config?.id!==COURSE_ID)throw Error('arcade:wrong_game');};
const view=r=>projectRun(r.state,Number(r.server_at),Number(r.revision));
export async function synchronizeRiver(rpc,input,actor,token=null){
 let row=input;valid(row);
 for(let attempt=0;attempt<3;attempt++){
  if(row.status!=='active')return row;
  const state=row.state??createRun(row.id,row.user_id,Date.parse(row.created_at));
  const next=recoverRun(state,Number(row.server_at));
  const result=await rpc('arcade_river_commit',{p_actor:actor,p_run:row.id,p_revision:row.revision,p_state:next,p_token:token});
  row=result.record;if(result.outcome!=='conflict')return row;
 }
 throw Error('arcade:concurrent_action');
}
export async function riverOperation(rpc,actor,body,attempt=0){
 if(body.op==='leaderboard')return rpc('arcade_river_board',{p_actor:actor,p_course:body.courseId,p_window:body.window??'30'});
 if(!['start','state','action'].includes(body.op))throw Error('arcade:invalid_operation');
 if(body.op==='start'&&(!uuid(body.requestId)||body.courseId!==COURSE_ID))throw Error('arcade:invalid_course');
 if(body.op!=='start'&&!uuid(body.runId))throw Error('arcade:invalid_run');
 if(body.op==='action'&&(!uuid(body.requestId)||!Number.isSafeInteger(body.revision)))throw Error('arcade:invalid_request');
 let row=body.op==='start'?await rpc('arcade_river_start',{p_actor:actor,p_request:body.requestId,p_course:body.courseId}):await rpc('arcade_load',{p_actor:actor,p_run:body.runId,p_request:body.op==='action'?body.requestId:null});
 valid(row);
 if(body.op!=='action')return view(await synchronizeRiver(rpc,row,actor));
 const intent=body.intent;
 if(!intent||!['input','abandon','bank','inside','deal','hit','stand','double','again','leave'].includes(intent.type))throw Error('arcade:invalid_action');
 const normalized=intent.type==='input'?{type:'input',at:intent.at,direction:intent.direction,sequence:intent.sequence}:intent.type==='deal'?{type:'deal',wager:intent.wager}:{type:intent.type};
 const fingerprint=JSON.stringify({runId:row.id,revision:body.revision,intent:normalized});
 if(row.receipt){if(row.receipt.run_id!==row.id||row.receipt.fingerprint!==fingerprint)throw Error('arcade:request_conflict');return view(await synchronizeRiver(rpc,row,actor));}
 if(intent.type==='input'){
  if(!Number.isSafeInteger(intent.sequence)||intent.sequence!==(row.state?.road.inputs.length??0)+1)throw Error('arcade:stale_input');
 }else if(Number(row.revision)!==body.revision)throw Error('arcade:stale_action');
 const state=row.state??createRun(row.id,row.user_id,Date.parse(row.created_at));
 const next=applyIntent(state,normalized,Number(row.server_at),shuffledShoe);
 const result=await rpc('arcade_river_commit',{p_actor:actor,p_run:row.id,p_revision:row.revision,p_state:next,p_request:body.requestId,p_fingerprint:fingerprint});
 if(result.outcome==='conflict'){if(intent.type==='input'&&attempt<2)return riverOperation(rpc,actor,body,attempt+1);throw Error('arcade:stale_action');}
 return view(result.record);
}
