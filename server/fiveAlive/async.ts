import {isUuid} from '../../src/lib/run21/model.js';
import {completedMatchOutcome,sealedProjection,submitSealedGuess,type SealedGame} from './rules.js';
import {loadVocabulary} from './vocabulary.js';

type Rpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
interface Child {
 id:string;game_type:string;revision:number;segment:number;terminal:boolean;held:boolean;status:string;
 organizer:string;opponent:string;config:{poolVersion:string};state:{fiveAlive:SealedGame};outcome:unknown;
 receipt?:{child_id:string;fingerprint:unknown}|null;
 actor_revision?:number;
}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)])):value;
function projection(child:Child,actor:string){
 if(child.game_type!=='five-alive'||!child.state?.fiveAlive)throw Error('delayed:invalid_state');
 return {id:child.id,game:'five-alive',revision:child.revision,segment:child.segment,
  terminal:child.terminal,held:child.held,status:child.status,outcome:child.outcome??null,
  view:sealedProjection(child.state.fiveAlive,actor)};
}

/** The database adapter owns row locking, revision CAS, expiry and settlement. */
export async function fiveAliveAsyncOperation(rpc:Rpc,actor:string,body:Record<string,unknown>){
 if(typeof body.op!=='string'||!['state','action'].includes(body.op)||typeof body.childId!=='string'||!isUuid(body.childId))throw Error('delayed:invalid_request');
 const intent=body.intent&&typeof body.intent==='object'?body.intent as Record<string,unknown>:null;
 if(body.op==='action'&&(typeof body.requestId!=='string'||!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||!Number.isSafeInteger(body.segment)||
   intent?.type!=='guess'||typeof intent.word!=='string'||!/^[A-Z]{5}$/.test(intent.word)))throw Error('delayed:invalid_command');
 let row=await rpc('delayed_five_alive_load',{p_child:body.childId,p_actor:actor,p_request:body.op==='action'?body.requestId:null}) as Child;
 if(row.game_type!=='five-alive'||![row.organizer,row.opponent].includes(actor))throw Error('delayed:not_authorized');
 if(body.op==='state')return projection(row,actor);
 if(!intent||typeof intent.word!=='string')throw Error('delayed:invalid_command');
 const fingerprint={child:body.childId,revision:body.revision,segment:body.segment,intent:body.intent};
 if(row.receipt){
  if(row.receipt.child_id!==row.id||JSON.stringify(canonical(row.receipt.fingerprint))!==JSON.stringify(canonical(fingerprint)))throw Error('delayed:request_conflict');
  return projection(row,actor);
 }
 // Peers can advance the shared revision before this load. Only immutable
 // receipts can establish that the requesting player's own state is unchanged.
 const submittedRevision=body.revision as number;
 if(row.terminal||row.held||submittedRevision<1||submittedRevision>row.revision||row.segment!==body.segment||
  (row.revision!==submittedRevision&&(!Number.isSafeInteger(row.actor_revision)||row.actor_revision!>submittedRevision)))throw Error('delayed:stale_action');
 const vocabulary=loadVocabulary(row.config?.poolVersion??null);
 if(!vocabulary.isValidGuess(intent.word))throw Error('delayed:invalid_guess');
 for(let attempt=0;attempt<3;attempt++){
  const previous=row.state.fiveAlive;
  const game=submitSealedGuess(previous,actor,intent.word,vocabulary.isValidGuess);
  const winner=game.current===3?completedMatchOutcome(game).winner:null;
  const result=await rpc('delayed_five_alive_commit',{p_child:row.id,p_actor:actor,p_request:body.requestId,
   p_revision:row.revision,p_segment:row.segment,p_fingerprint:fingerprint,p_game:game,p_winner:winner}) as {outcome:string;record:Child};
  if(result.outcome==='committed'||result.outcome==='duplicate')return projection(result.record,actor);
  if(result.outcome==='deadline')throw Error('delayed:deadline');
  const next=result.record;
  const index=previous.players.indexOf(actor);
  if(result.outcome!=='conflict'||!next||next.terminal||next.held||next.id!==row.id||next.segment!==row.segment||
   !next.state?.fiveAlive||index<0||next.state.fiveAlive.current!==previous.current||
   JSON.stringify(canonical([next.state.fiveAlive.players,next.state.fiveAlive.answers,next.state.fiveAlive.rounds[index],next.state.fiveAlive.sharedScores]))!==
   JSON.stringify(canonical([previous.players,previous.answers,previous.rounds[index],previous.sharedScores])))throw Error('delayed:stale_action');
  row=next;
 }
 throw Error('delayed:stale_action');
}
