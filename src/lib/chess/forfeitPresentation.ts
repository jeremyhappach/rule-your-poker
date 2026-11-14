import type {ChessState} from './rules';
export const CHESS_FORFEIT_BURST_MS=760;
export const CHESS_FORFEIT_ANNOUNCE_MS=3350;
export const CHESS_FORFEIT_SETTLEMENT_MS=5200;
export function liveForfeitElapsed(view:ChessState|null,now:number):number|null{
 const start=view?.terminal?.forfeitStartedAt;
 return view?.phase==='complete'&&view.reason==='resignation'&&typeof start==='number'
  ?Math.max(0,now-start):null;
}
export function forfeitAnnouncementAt(view:ChessState):number{
 return view.reason==='resignation'&&typeof view.terminal?.forfeitStartedAt==='number'
  ?view.terminal.forfeitStartedAt+CHESS_FORFEIT_ANNOUNCE_MS:view.terminal?.startedAt??0;
}
