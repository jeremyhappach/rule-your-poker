import {Chess} from 'chess.js';
import type {ChessState} from './rules';
export {CHESS_CHECK_HOLD_MS,CHESS_CHECKMATE_HOLD_MS} from './timeline';
export function chessStatus(v:Pick<ChessState,'fen'|'reason'|'phase'>){
 const engine=new Chess(v.fen);
 return {check:engine.isCheck(),checkmate:v.phase==='complete'&&v.reason==='checkmate'&&engine.isCheckmate(),color:engine.turn()};
}
