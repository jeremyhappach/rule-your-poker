import {useCallback} from 'react';
import {useChipPresentationCursorState,useChipTransferPresentationAdmission} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import type {GolfSnapshot} from '@/lib/golf/model';
export function isGolfTerminalBatch(batch:ChipPresentationBatch,v:GolfSnapshot){
 if(!v.settlement||!v.financial?.resultId||batch.id!==v.financial.batch?.id||batch.game_id!==v.identity?.sessionId||batch.dealer_game_id!==v.id)return false;
 const deltas:Record<string,number>={};
 for(const t of batch.transfers){if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||!(t.amount>0))return false;deltas[t.from.playerId]=(deltas[t.from.playerId]??0)-t.amount;deltas[t.to.playerId]=(deltas[t.to.playerId]??0)+t.amount;}
 return Object.keys(deltas).every(id=>v.players.some(p=>p.id===id))&&v.players.every(p=>(deltas[p.id]??0)===(v.settlement![p.id]??0));
}
export function useGolfFinancial(v:GolfSnapshot|null,ended:boolean){
 const batch=v?.financial?.batch,valid=!!batch&&!!v&&isGolfTerminalBatch(batch,v);
 const admit=useCallback((b:ChipPresentationBatch)=>b.dealer_game_id!==v?.id||!!v&&!ended&&isGolfTerminalBatch(b,v),[v,ended]);
 useChipTransferPresentationAdmission(admit);
 const cursor=useChipPresentationCursorState(valid?batch.cursor:null);
 return !!v?.settlement&&(v.players.every(p=>(v.settlement![p.id]??0)===0)||valid&&['settled','reconciled'].includes(cursor));
}
