export type ElevenIntent={type:'group';items:number[]}|{type:'pass'|'take_score'};
export interface ElevenResult {id?:string;reason:string;score:number;scoreBefore:number;displayScore:number;stageScore:number;groupBonus:number;clearBonus:number;stockBonus:number;timeBonus:number;completedAt:number}
export interface ElevenBoard {
 rules:{version:'eleven-up/1';stageMs:number;introMs:number;readyMs:number;holdMs:number;clearCelebrationMs:number};
 phase:'intro'|'ready'|'playing'|'stage_complete'|'complete';slots:(number|null)[];current:number|null;
 exposed:number[];passSlot:number|null;canPass:boolean;stockRemaining:number;groups:number;score:number;deadline:number;
 result?:ElevenResult|null;event:{label:string;points:number};
}
export interface ElevenSnapshot {
 completion?:import('../arcade/model').CompletionRecord|null;
 id:string;revision:number;serverAt:number;scope:string;round:number;board:ElevenBoard;
 canAct:boolean;paused:boolean;pausedAt?:number|null;finished:boolean;settled:boolean;solo:boolean;
 players:{id:string;name:string;score:number;active:boolean;chips?:number}[];
}
// Presentation only: item IDs are opaque stable identities, values match frozen v1.
export const ballValue=(id:number)=>id<16?1:2+Math.floor((id-16)/4);
const diamond=[[0,0],[-.5,1],[.5,1],[-1,2],[0,2],[1,2],[-.5,3],[.5,3],[0,4]];
export function ballPosition(slot:number){
 if(slot>=18)return [[50,10],[44,24],[56,24],[50,38]][slot-18];
 const [x,y]=diamond[slot%9];return [(slot<9?22:78)+x*12,24+y*14];
}
export function acceptElevenSnapshot(old:ElevenSnapshot|null,next:ElevenSnapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('11 Up snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){
  const semantic=(s:ElevenSnapshot)=>JSON.stringify({...s,serverAt:0,players:s.players.map(({chips,...player})=>player)});
  if(semantic(old)!==semantic(next))throw Error('11 Up conflicting snapshot');
 }
 return next;
}
export function multiplayerSnapshot(v:any):ElevenSnapshot {
 const id=v.identity.dealerGameId,scope=[id,v.identity.roundId,v.activePlayerId,v.stage].join(':');
 const {rules,phase,slots,current,exposed,passSlot,canPass,stockRemaining,groups,score,deadline,event}=v;
 return {id,revision:v.revision,serverAt:v.serverAt,scope,round:v.stage,board:{rules,phase,slots,current,exposed,passSlot,canPass,stockRemaining,groups,score,deadline,event,result:v.phase==='stage_complete'?v.stages.at(-1):null},canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,solo:false,
 players:v.players.map((p:any)=>({id:p.id,name:p.name,score:v.scores[p.id]??0,active:p.id===v.activePlayerId,chips:v.financial?.balances[p.id]}))};
}
export function arcadeSnapshot(v:any,userId:string):ElevenSnapshot {
 return {id:v.id,revision:v.revision,serverAt:v.serverAt,scope:v.view.roundId,round:v.view.round,board:v.view,canAct:v.status==='active',paused:false,finished:v.status!=='active',settled:false,solo:true,completion:v.completion,players:[{id:userId,name:'You',score:v.score,active:true}]};
}
