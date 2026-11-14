import {chooseChessBotMove} from './bot.js';
import {playChess, type ChessState} from '../../src/lib/chess/rules.js';
import {CHESS_CHECKMATE_HOLD_MS,chessMoveDuration} from '../../src/lib/chess/timeline.js';
type Rpc = (name:string,args:Record<string,unknown>)=>Promise<any>;
export async function recoverChess(rpc:Rpc,token:string) {
  const claim=await rpc('chess_bot_claim',{p_token:token});
  if (!claim.accepted) throw Error('chess:recovery_token_denied');
  let processed=0,failures=0;
  for (const id of claim.matches as string[]) {
    try {
      const row=await rpc('chess_bot_load',{p_token:token,p_id:id});
      if (!row) continue;
      const state=row.state as ChessState,actor=state.players[state.turnIndex].id;
      const choice=chooseChessBotMove(state,row.serverAt);
      const next=playChess(state,actor,choice.intent,row.serverAt);
      if (next.reason==='checkmate') next.movePresentation={readyAt:row.serverAt+chessMoveDuration(next.moves.at(-1)!)+CHESS_CHECKMATE_HOLD_MS};
      const result=await rpc('chess_bot_commit',{p_token:token,p_id:id,p_revision:row.revision,p_actor:actor,p_state:next,p_intent:choice.intent});
      if (result.outcome==='committed') processed++;
    } catch {failures++;}
  }
  await rpc('chess_bot_complete',{p_token:token,p_failure:failures?'chess:bot_recovery_failed':null});
  return {processed,failures};
}
