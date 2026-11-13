import {RUN21_FAILURE_CUE_MS} from '../run21/failureTiming.js';
export const CHESS_CHECK_HOLD_MS=2000,CHESS_CHECKMATE_HOLD_MS=3200;
export const chessMotion={slide:360,hop:480,poof:RUN21_FAILURE_CUE_MS,landing:.8} as const;
export function chessMoveDuration(move:{piece:string;capture?:unknown}){return chessMotion[move.piece==='n'?'hop':'slide']+(move.capture?chessMotion.poof:0);}
