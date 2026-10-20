import type {TripFlipBoard} from './model';
/** Read only authoritative totals; pause shifts the deadline, not completedAt.
 * The shared timeline and scoring audio consume this same elapsed clock. */
export function tripFlipRoundPresentation(board:TripFlipBoard,scope:string,now:number){
 const result=board.phase==='stage_complete'?board.result:null;
 return result?{...result,id:result.id??`${scope}:result`,elapsed:Math.max(0,board.rules.holdMs-(board.deadline-now))}:null;
}
