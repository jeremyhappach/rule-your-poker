import {randomInt} from 'node:crypto';
import {createRun,recoverRun,applyIntent,projectRun,type MegaRun,type Intent} from '../../src/lib/megaCardGolf/engine.js';
import {settings,COURSE_IDS,MEGA_RULESET,MEGA_SEQUENTIAL_RULESET,MEGA_STAND_PAT_RULESET,MEGA_ANYTIME_STAND_PAT_RULESET,type MegaRuleset,type CourseConfig} from '../../src/lib/megaCardGolf/config.js';
import {isUuid} from '../../src/lib/run21/model.js';
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<any>;
export interface MegaRecord {id:string;user_id:string;game:string;ruleset:string;config:CourseConfig;state:MegaRun|null;revision:number;server_at:number;created_at:string;status:string;receipt?:{run_id:string;fingerprint:string}|null}
function decks(holes:number){return Array.from({length:holes},()=>{const a=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;});}
function validRecord(row:MegaRecord){if(row.game!=='mega-card-golf'||![MEGA_RULESET,MEGA_SEQUENTIAL_RULESET,MEGA_STAND_PAT_RULESET,MEGA_ANYTIME_STAND_PAT_RULESET].includes(row.ruleset as MegaRuleset))throw Error('arcade:wrong_game');if(row.state&&row.state.ruleset!==row.ruleset)throw Error('arcade:ruleset_mismatch');}
const projection=(r:MegaRecord)=>({...projectRun(r.state!,Number(r.server_at)),revision:Number(r.revision)});
export async function synchronizeMega(rpc:Rpc,input:MegaRecord,actor:string|null,token:string|null=null){
 let row=input;validRecord(row);
 for(let attempt=0;attempt<3;attempt++){
  if(row.status!=='active')return row;
  const state=row.state??createRun(row.id,row.user_id,row.config,decks(row.config.holes),Date.parse(row.created_at),row.ruleset as MegaRuleset);
  const next=recoverRun(state,Number(row.server_at));
  if(row.state&&JSON.stringify(next)===JSON.stringify(state))return row;
  const committed=await rpc('arcade_mega_commit',{p_actor:actor,p_run:row.id,p_revision:row.revision,p_state:next,p_token:token});
  row=committed.record;if(committed.outcome!=='conflict')return row;
 }
 throw Error('arcade:concurrent_action');
}
export async function megaOperation(rpc:Rpc,actor:string,body:Record<string,any>){
 if(body.op==='catalog')return rpc('arcade_mega_catalog',{p_actor:actor});
 if(body.op==='leaderboard')return rpc('arcade_mega_board',{p_actor:actor,p_course:body.courseId,p_board:body.boardId??null,p_window:body.window??'30'});
 if(body.op==='defaults')return rpc('arcade_mega_save',{p_actor:actor,p_course:body.id,p_revision:body.revision,p_settings:settings(body.settings),p_choice:body.boardChoice??null});
 if(!['start','state','action'].includes(body.op))throw Error('arcade:invalid_operation');
 if(body.op==='start'&&(!isUuid(body.requestId)||!COURSE_IDS.includes(body.courseId)))throw Error('arcade:invalid_request');
 if(body.op!=='start'&&!isUuid(body.runId))throw Error('arcade:invalid_run');
 let row:MegaRecord=body.op==='start'?await rpc('arcade_mega_start',{p_actor:actor,p_request:body.requestId,p_course:body.courseId}):await rpc('arcade_load',{p_actor:actor,p_run:body.runId,p_request:body.op==='action'?body.requestId:null});
 validRecord(row);const receipt=row.receipt;row=await synchronizeMega(rpc,row,actor);
 if(body.op==='action'){
  const intent=body.intent as Intent;
  if(!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||!Number.isInteger(body.hole)||!intent||!['open','draw','discard','stand-pat','replace','abandon'].includes(intent.type))throw Error('arcade:invalid_action');
  const normalized:Intent=intent.type==='open'?{type:'open',indices:intent.indices}:intent.type==='replace'?{type:'replace',index:intent.index}:{type:intent.type};
  const fingerprint=JSON.stringify({runId:row.id,revision:body.revision,hole:body.hole,intent:normalized});
  if(receipt){if(receipt.run_id!==row.id||receipt.fingerprint!==fingerprint)throw Error('arcade:request_conflict');}
  else{
   if(Number(row.revision)!==body.revision||row.state!.hole!==body.hole)throw Error('arcade:stale_action');
   const next=applyIntent(row.state!,normalized,Number(row.server_at));
   const committed=await rpc('arcade_mega_commit',{p_actor:actor,p_run:row.id,p_revision:row.revision,p_state:next,p_request:body.requestId,p_fingerprint:fingerprint});
   if(committed.outcome==='deadline'){await synchronizeMega(rpc,committed.record,actor);throw Error('arcade:stale_action');}
   if(committed.outcome==='conflict')throw Error('arcade:stale_action');row=committed.record;
  }
 }
 return projection(row);
}
