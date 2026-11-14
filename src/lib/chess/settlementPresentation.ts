import type {ChessSnapshot} from './client';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';

/** Read the committed transfer, never the session pot (Chess has no ante pot). */
export function chessSettlementMatchesBatch(v:ChessSnapshot,b:ChipPresentationBatch):boolean {
 if(!v.settlement||b.id!==v.financial.batch?.id||b.game_id!==v.identity.sessionId||b.dealer_game_id!==v.id)return false;
 const deltas:Record<string,number>={};
 for(const t of b.transfers){
  if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||!Number.isSafeInteger(t.amount)||t.amount<=0)return false;
  deltas[t.from.playerId]=(deltas[t.from.playerId]??0)-t.amount;
  deltas[t.to.playerId]=(deltas[t.to.playerId]??0)+t.amount;
 }
 return Object.keys(deltas).every(id=>v.players.some(p=>p.id===id))&&v.players.every(p=>
  (deltas[p.id]??0)===v.settlement![p.id]&&
  b.opening_balances?.[`player:${p.id}`]+v.settlement![p.id]===b.closing_balances?.[`player:${p.id}`]&&
  b.closing_balances?.[`player:${p.id}`]===v.financial.balances[p.id]);
}

/** Null keeps inconsistent/missing financial evidence explicit and blocks handoff. */
export function chessSettlementNet(v:ChessSnapshot):number|null {
 const deltas=v.settlement;
 if(!v.settled||!deltas||v.financial.resultId!==v.terminal?.resultId||!v.financial.resultId||
  Object.keys(deltas).length!==v.players.length||!v.players.every(p=>Number.isSafeInteger(deltas[p.id]))||
  v.players.reduce((sum,p)=>sum+deltas[p.id],0)!==0)return null;
 if(!v.players.every(p=>deltas[p.id]===0)&&(!v.financial.batch||!chessSettlementMatchesBatch(v,v.financial.batch)))return null;
 return Number.isSafeInteger(deltas[v.viewerId])?deltas[v.viewerId]:null;
}
