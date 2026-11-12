import {isUuid} from '../../src/lib/run21/model.js';
import {playChess,type ChessIntent,type ChessState} from '../../src/lib/chess/rules.js';
export interface ChessRow {state:ChessState;revision:number;serverAt:number;viewerId:string;paused:boolean;pausedAt:number|null;finished:boolean;settled:boolean;settlement:Record<string,number>|null;financial:any;receipt?:{actor:string;fingerprint:unknown}}
export function projectChess(row:ChessRow){const {receipt,state,...rest}=row;return {...rest,...state,id:row.state.identity.dealerGameId,canAct:!row.paused&&!row.settled&&row.state.players[row.state.turnIndex].id===row.viewerId};}
export async function chessOperation(rpc:(name:string,args:Record<string,unknown>)=>Promise<any>,actor:string,body:Record<string,any>){
 if(!['state','action'].includes(body.op)||!['live','async'].includes(body.mode)||!isUuid(body.matchId))throw Error('chess:invalid_request');
 const args={p_mode:body.mode,p_id:body.matchId,p_actor:actor};
 if(body.op==='action'&&(!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||!body.intent||!['move','open','bank','resign'].includes(body.intent.type)))throw Error('chess:invalid_action');
 let row:ChessRow=await rpc('chess_load',{...args,p_request:body.op==='action'?body.requestId:null});
 if(body.op==='action'){
  const fingerprint={revision:body.revision,intent:body.intent};
  if(row.receipt){if(row.receipt.actor!==actor||JSON.stringify(sort(row.receipt.fingerprint))!==JSON.stringify(sort(fingerprint)))throw Error('chess:request_conflict');return projectChess(row);}
  if(row.revision!==body.revision||!projectChess(row).canAct)throw Error('chess:stale_action');
  const next=playChess(row.state,row.viewerId,body.intent as ChessIntent,Number(row.serverAt));
  const result=await rpc('chess_commit',{...args,p_revision:body.revision,p_state:next,p_request:body.requestId,p_fingerprint:fingerprint});
  if(!['committed','duplicate'].includes(result.outcome))throw Error('chess:stale_action');row=result.record;
 }
 return projectChess(row);
}
function sort(value:any):any{return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;}
