import {useCallback,useState} from 'react';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
type Round={key:string|null;status:'waiting'|'pending'|'done'|'reconcile'};
type Input={owner?:string|null;dealer:string|null|undefined;round:string|null;key:string|null;pending:boolean;show:boolean;complete:()=>void;resultObserved:boolean};
type Ledger={owner?:string|null;dealer:Input['dealer'];round:string|null;rounds:Record<string,Round>;outgoing:{round:string;key:string}[]};
/** Shell retirement queue: old announcements keep their immutable owner. Game
 * controllers still reset immediately on round changes; accounting never waits. */
export function useDiceRolloverBarrier(input:Input){
 const [stored,setStored]=useState<Ledger>({owner:input.owner,dealer:input.dealer,round:input.round,rounds:{},outgoing:[]});
 let value=stored;
 if(value.dealer!==input.dealer||value.owner!==input.owner)value={owner:input.owner,dealer:input.dealer,round:input.round,rounds:{},outgoing:[]};
 if(value.round!==input.round){
  const old=value.round&&value.rounds[value.round];
  value={...value,round:input.round,rounds:{...value.rounds},outgoing:[...value.outgoing]};
  if(old?.status==='pending'&&old.key)value.outgoing.push({round:stored.round!,key:old.key});
  else if(old?.status==='waiting')value.rounds[stored.round!]={...old,status:'reconcile'};
 }
 if(input.round){
  const status=input.pending?'pending':input.resultObserved||input.key?'done':'waiting';
  const old=value.rounds[input.round];
  if(old?.key!==input.key||old?.status!==status)value={...value,rounds:{...value.rounds,[input.round]:{key:input.key,status}}};
 }
 if(value!==stored)setStored(value);
 const outgoing=value.outgoing[0];
 const key=outgoing?.key??input.key;
 const complete=useCallback(()=>{
  const round=outgoing?.round??input.round;
  setStored(previous=>{
   if(previous.dealer!==input.dealer||previous.owner!==input.owner||!round||previous.rounds[round]?.key!==key)return previous;
   return {...previous,rounds:{...previous.rounds,[round]:{key,status:'done'}},outgoing:previous.outgoing.filter(item=>item.key!==key)};
  });
  if(!outgoing)input.complete();
 },[input.owner,input.dealer,input.round,input.complete,outgoing?.round,key]);
 const admit=useCallback((batch:ChipPresentationBatch):boolean|'reconcile'=>{
  const predecessor=batch.source_round_id,successor=batch.successor_round_id;
  if(batch.dealer_game_id!==value.dealer)return 'reconcile';
  // Initial admission has an explicit destination and no predecessor. The
  // server validates hand 1; the shared ledger still owns hydration/deduping.
  if(!predecessor&&successor){
   if(!value.round)return false;
   return successor===value.round?true:'reconcile';
  }
  if(!predecessor||!successor)return 'reconcile';
  const receipt=value.rounds[predecessor];
  if(!receipt||receipt.status==='reconcile')return 'reconcile';
  if(receipt.status!=='done')return false;
  return successor===value.round?true:predecessor===value.round?false:'reconcile';
 },[value.dealer,value.round,value.rounds]);
 return {key,show:!!outgoing||input.show,complete,admit};
}
