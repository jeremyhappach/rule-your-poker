import {isUuid} from '../../src/lib/run21/model.js';
import {submitSoloGuess, soloProjection, type SoloGame} from './rules.js';
import {loadVocabulary} from './vocabulary.js';

type Rpc = (name:string,args:Record<string,unknown>)=>Promise<unknown>;
interface FiveAliveRun {
  id:string; user_id:string; game:string; ruleset:string; revision:number; status:string;
  config:Record<string,unknown>; score:number; completion?:unknown; state:SoloGame & {
    runId:string;userId:string;config:Record<string,unknown>;round:number;status:string;score:number;
  }; receipt?:{run_id:string;fingerprint:string}|null;
}

function projection(run:FiveAliveRun) {
  if(run.game!=='five-alive'||!run.state)throw Error('arcade:invalid_state');
  const view=soloProjection(run.state);
  return {id:run.id,game:run.game,ruleset:run.ruleset,revision:run.revision,status:run.status,
    score:run.score,dueAt:null,serverAt:Date.now(),events:[],completion:run.completion??null,view:{...view,roundId:`${run.id}:${view.round}`}};
}

/** Candidate adapter: SQL start allocates all three private answers atomically. */
export async function fiveAliveArcadeOperation(rpc:Rpc,actor:string,body:Record<string,unknown>) {
  if(typeof body.op!=='string'||!['start','state','action'].includes(body.op))throw Error('arcade:invalid_operation');
  if(body.op==='start'){
    if(typeof body.requestId!=='string'||!isUuid(body.requestId))throw Error('arcade:invalid_request');
    return projection(await rpc('arcade_five_alive_start',{p_actor:actor,p_request:body.requestId}) as FiveAliveRun);
  }
  if(typeof body.runId!=='string'||!isUuid(body.runId))throw Error('arcade:invalid_run');
  const intent=body.intent&&typeof body.intent==='object'?body.intent as Record<string,unknown>:null;
  if(body.op==='action'&&(typeof body.requestId!=='string'||!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||typeof body.roundId!=='string'||
    !intent||typeof intent.type!=='string'||!['guess','abandon'].includes(intent.type)||
    (intent.type==='guess'&&(typeof intent.word!=='string'||!/^[A-Z]{5}$/.test(intent.word)))))throw Error('arcade:invalid_command');
  const run=await rpc('arcade_load',{p_actor:actor,p_run:body.runId,p_request:body.op==='action'?body.requestId:null}) as FiveAliveRun;
  if(run.game!=='five-alive'||run.user_id!==actor)throw Error('arcade:not_found');
  if(body.op==='state')return projection(run);
  if(!intent)throw Error('arcade:invalid_command');
  const fingerprint=JSON.stringify([body.runId,body.revision,body.roundId,intent.type,intent.word??null]);
  if(run.receipt){
    if(run.receipt.run_id!==run.id||run.receipt.fingerprint!==fingerprint)throw Error('arcade:request_conflict');
    return projection(run);
  }
  if(run.status!=='active'||run.revision!==body.revision||`${run.id}:${run.state.current+1}`!==body.roundId)throw Error('arcade:stale_action');
  const old=run.state;
  const vocabulary=loadVocabulary(run.config.poolVersion??null);
  if(intent.type==='guess'&&(typeof intent.word!=='string'||!vocabulary.isValidGuess(intent.word)))throw Error('arcade:invalid_guess');
  const next=intent.type==='abandon'?old:submitSoloGuess(old,intent.word as string,vocabulary.isValidGuess);
  const view=soloProjection(next);
  const status=intent.type==='abandon'?'abandoned':view.completed?'completed':'active';
  const state={...next,runId:run.id,userId:actor,config:run.config,round:view.round,status,score:view.score};
  const result=await rpc('arcade_commit',{p_actor:actor,p_run:run.id,p_revision:run.revision,p_state:state,p_due:null,
    p_request:body.requestId,p_fingerprint:fingerprint}) as {outcome:string;record:FiveAliveRun};
  if(result.outcome!=='committed'&&result.outcome!=='duplicate')throw Error('arcade:stale_action');
  return projection(result.record);
}
