import {useCallback,useEffect,useRef,useState} from 'react';
import confetti from 'canvas-confetti';
import {supabase} from '@/integrations/supabase/client';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useChipPresentationCursorState,useChipTransferPresentationAdmission} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import {run21Request} from '@/lib/run21/localClient';
import {assertFinalScores} from '@/lib/run21/presentation';
import type {Projection} from '@/lib/run21/model';

// Browser-local presentation receipts survive terminal component remounts.
// They never determine balances, settlement or the server's continuation policy.
const terminals=new Map<string,{announced:boolean;close?:Promise<unknown>;completed:boolean}>();

export function isRun21TerminalBatch(batch:ChipPresentationBatch,view:Projection):boolean {
  const receipt=view.settlement;
  return !!receipt && batch.id===receipt.transferBatchId && batch.game_id===view.identity.sessionId &&
    batch.dealer_game_id===view.identity.dealerGameId && batch.transfers.length===1 && batch.transfers.every(t=>
      t.amount===receipt.amount && t.from.kind==='player' && t.from.playerId===receipt.loserId &&
      t.to.kind==='player' && t.to.playerId===receipt.winnerId);
}

/** Observe the canonical flight; completion still closes through the existing server owner. */
export function useRun21Terminal(view:Projection|undefined,sessionEnded:boolean,onActive:(v:boolean)=>void,onComplete:(id:string)=>void) {
  const announcements=useAnnouncements();
  const receipt=view?.settlement;
  const key=receipt&&view?`${view.identity.sessionId}:${view.identity.dealerGameId}:${receipt.resultId}:${receipt.transferBatchId}`:null;
  const [batch,setBatch]=useState<{key:string;cursor:number}|null>(null),[error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const retry=useCallback(()=>setAttempt(n=>n+1),[]);
  const callbacks=useRef({onActive,onComplete});callbacks.current={onActive,onComplete};
  const current=useRef(view);current.current=view;
  const cursorState=useChipPresentationCursorState(batch?.key===key?batch.cursor:undefined);
  const admit=useCallback((candidate:ChipPresentationBatch)=>{
    const v=current.current;
    if(!v || candidate.dealer_game_id!==v.identity.dealerGameId)return true;
    return !candidate.transfers.some(t=>t.from.kind==='player'&&t.to.kind==='player') ||
      (!sessionEnded && isRun21TerminalBatch(candidate,v));
  },[key,sessionEnded]);
  useChipTransferPresentationAdmission(admit);

  useEffect(()=>{
    if(!key||!receipt||!view||sessionEnded)return;
    let cancelled=false;
    setError('');
    try{assertFinalScores(view);}catch(e){setError((e as Error).message);return;}
    let terminal=terminals.get(key);
    if(!terminal){terminal={announced:false,completed:false};terminals.set(key,terminal);}
    if(terminal.completed)return;
    callbacks.current.onActive(true);
    if(!terminal.announced){
      terminal.announced=true;
      const winner=view.players.find(p=>p.id===receipt.winnerId)!;
      announcements.clearAmbient();
      announcements.emit({id:`match_win:run21:${receipt.resultId}`,type:'match_win',scope:{dealerGameId:view.identity.sessionId,roundId:view.roundId},
        payload:{winnerName:winner.name,text:`${winner.name} Wins! ${view.players.map(p=>`${p.name}: ${view.cumulative[p.id].toLocaleString()}`).join(' • ')}`,
          score:{winner:view.cumulative[receipt.winnerId],loser:view.cumulative[receipt.loserId]}},ttlMs:10000});
      if(winner.id===view.viewerId)confetti({particleCount:150,spread:70,origin:{y:.6},colors:['#FFD700','#FFA500','#FF6347','#00CED1','#9370DB']});
    }
    // Resolve the immutable receipt to its real journal cursor, never a locally
    // synthesized animation id. Cursor state survives child remounts.
    void (async()=>{
      const {data,error:failure}=await supabase.from('gameplay_transfer_batches').select('*')
        .eq('game_id',view.identity.sessionId).eq('id',receipt.transferBatchId).maybeSingle();
      if(cancelled)return;
      if(failure||!data||!isRun21TerminalBatch(data as unknown as ChipPresentationBatch,view)){
        setError('Could not verify Run21 transfer presentation. Reconnect to retry.');return;
      }
      setBatch({key,cursor:Number(data.cursor)});
    })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not load Run21 transfer.');});
    return()=>{cancelled=true;};
    // Identity-scoped: repeated snapshots must not restart presentation or queries.
  },[key,sessionEnded,attempt]);

  useEffect(()=>{
    if(!key||!view||sessionEnded||batch?.key!==key||!['settled','reconciled'].includes(cursorState))return;
    const terminal=terminals.get(key);
    if(!terminal||terminal.completed)return;
    let cancelled=false;
    const identity=`run21|winseq|${view.identity.sessionId}|${view.identity.dealerGameId}|${view.identity.handNumber}`;
    terminal.close??=run21Request(view.identity.sessionId,'close',{});
    void terminal.close.then(()=>{
      if(cancelled||terminal.completed)return;
      terminal.completed=true;
      callbacks.current.onComplete(identity);callbacks.current.onActive(false);
    }).catch(e=>{terminal.close=undefined;if(!cancelled)setError(e instanceof Error?e.message:'Could not complete Run21.');});
    return()=>{cancelled=true;};
  },[key,batch,cursorState,sessionEnded,attempt]);
  return {error,retry};
}
