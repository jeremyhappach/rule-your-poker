import {useCallback} from 'react';
import {useChipPresentationCursorState,useChipTransferPresentationAdmission} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import type {Projection} from '@/lib/triTowers/model';

export function isTriTowersTerminalBatch(batch:ChipPresentationBatch,view:Projection):boolean{
 if(!view.settlement||!view.financial?.resultId||batch.id!==view.financial.batch?.id||
  batch.game_id!==view.identity.sessionId||batch.dealer_game_id!==view.identity.dealerGameId)return false;
 const deltas:Record<string,number>={};
 for(const t of batch.transfers){
  if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||!(t.amount>0))return false;
  deltas[t.from.playerId]=(deltas[t.from.playerId]??0)-t.amount;
  deltas[t.to.playerId]=(deltas[t.to.playerId]??0)+t.amount;
 }
 return Object.keys(deltas).every(id=>view.players.some(p=>p.id===id))&&view.players.every(p=>(deltas[p.id]??0)===(view.settlement![p.id]??0));
}
/** The shared ledger owns flights, balances and replay protection. */
export function useTriTowersFinancialPresentation(view:Projection,sessionEnded=false){
 const batch=view.financial?.batch;
 const valid=!!batch&&isTriTowersTerminalBatch(batch,view);
 const admit=useCallback((candidate:ChipPresentationBatch)=>candidate.dealer_game_id!==view.identity.dealerGameId||
  (!sessionEnded&&isTriTowersTerminalBatch(candidate,view)),[view.identity.dealerGameId,view.financial,view.settlement,sessionEnded]);
 useChipTransferPresentationAdmission(admit);
 const cursor=useChipPresentationCursorState(valid?batch.cursor:null);
 const allTie=!!view.settlement&&view.players.every(p=>(view.settlement![p.id]??0)===0);
 return {ready:!!view.settlement&&(allTie||valid&&['settled','reconciled'].includes(cursor)),cursor};
}
