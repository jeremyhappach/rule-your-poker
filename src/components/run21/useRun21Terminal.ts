import {useEffect,useRef,useState} from 'react';
import confetti from 'canvas-confetti';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useChipTransport} from '@/lib/canonicalShell/ChipTransportProvider';
import {run21Request} from '@/lib/run21/localClient';
import {assertFinalScores} from '@/lib/run21/presentation';
import type {Projection} from '@/lib/run21/model';

/** The committed receipt drives the shell's announcement, transport and completion. */
export function useRun21Terminal(view:Projection|undefined,sessionEnded:boolean,onActive:(v:boolean)=>void,onComplete:(id:string)=>void) {
  const announcements=useAnnouncements(),transport=useChipTransport();
  const started=useRef<string|null>(null),[error,setError]=useState('');
  const callbacks=useRef({onActive,onComplete});callbacks.current={onActive,onComplete};
  useEffect(()=>{
    if(!view?.settlement||sessionEnded||started.current===view.settlement.resultId)return;
    try{assertFinalScores(view);}catch(e){setError((e as Error).message);return;}
    const receipt=view.settlement,winner=view.players.find(p=>p.id===receipt.winnerId)!,loser=view.players.find(p=>p.id===receipt.loserId)!;
    started.current=receipt.resultId;callbacks.current.onActive(true);
    const identity=`run21|winseq|${view.identity.sessionId}|${view.identity.dealerGameId}|1`;
    const complete=async()=>{
      try{
        await run21Request(view.identity.sessionId,'close',{});
        callbacks.current.onComplete(identity);callbacks.current.onActive(false);
      }catch(e){setError(e instanceof Error?e.message:'Could not complete Run21.');}
    };
    announcements.clearAmbient();
    announcements.emit({id:`match_win:run21:${receipt.resultId}`,type:'match_win',scope:{dealerGameId:view.identity.sessionId,roundId:view.roundId},
      payload:{winnerName:winner.name,text:`${winner.name} Wins! ${view.players.map(p=>`${p.name}: ${view.cumulative[p.id].toLocaleString()}`).join(' • ')}`,
        score:{winner:view.cumulative[winner.id],loser:view.cumulative[loser.id]}},ttlMs:10000});
    requestAnimationFrame(()=>{
      if(winner.id===view.viewerId)confetti({particleCount:150,spread:70,origin:{y:.6},colors:['#FFD700','#FFA500','#FF6347','#00CED1','#9370DB']});
      transport.dispatch({id:receipt.transferBatchId,amount:receipt.amount,reason:'transfer',variant:'canonicalWinTransfer',
        from:{kind:'seat',position:loser.seat},to:{kind:'seat',position:winner.seat},destinationReaction:{bounce:true,pulse:true}},
        {onSettled:()=>void complete()});
    });
  },[view,sessionEnded,announcements,transport]);
  return error;
}
