import {useRun21Action} from './useRun21Action';
import {subscribeAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
import {run21SnapshotTiming,run21RoundTiming,run21Timing} from '@/lib/run21/diagnostics';
import {UncertainRun21Action} from '@/lib/run21/actionPresentation';
import {useCallback,useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {acceptRun21Snapshot,run21Fetch,run21Request,type Run21Snapshot} from '@/lib/run21/localClient';
import {eventSnapshot,LivePresentation,presentationPhase} from '@/lib/run21/livePresentation';
import {legalColumns} from '@/lib/run21/rules';
import type {Command,Intent} from '@/lib/run21/model';
import {ScoreCelebrations} from '@/lib/run21/scoreCelebration';
import {roundIntro} from '@/lib/run21/roundIntro';
export function useRun21Local(gameId:string,dealerGameId:string,authoritativeComplete=false) {
  const [snapshot,setSnapshot]=useState<Run21Snapshot|null>(null),latest=useRef<Run21Snapshot|null>(null);
  const presentation=useRef(new LivePresentation());
  const celebrations=useRef(new ScoreCelebrations());
  const [,refreshPresentation]=useState(0);
  const [error,setError]=useState<string|null>(null),[connected,setConnected]=useState(false);
  const [retry,setRetry]=useState(0);
  const clock=useRef({server:0,local:0}),[now,setNow]=useState(0);
  const [audioEpoch,setAudioEpoch]=useState(0);
  const storageKey=`run21-presentation:${gameId}:${dealerGameId}`;
  const paint=useCallback((live=false)=>{
    const p=presentation.current,tick=performance.now(),event=p.advance(tick,live);
    if(event&&latest.current){
      const shown=eventSnapshot(latest.current,event);setSnapshot(shown);
      try{sessionStorage.setItem(storageKey,JSON.stringify({sequence:p.sequence,snapshot:shown}));}catch{/* Optional checkpoint. */}
    }
    const liveNow=clock.current.server+tick-clock.current.local;
    if(latest.current){const shown=celebrations.current.frame(latest.current,liveNow,tick);setSnapshot(shown.snapshot);setNow(shown.now);}
  },[storageKey]);
  const accept=useCallback((value:Run21Snapshot, actionResponse=false,recovery=false,continuousRenewal=false)=>{
    const accepted=acceptRun21Snapshot(latest.current,value,dealerGameId);
    if(!accepted||accepted!==value)return;
    if(recovery||!latest.current)setAudioEpoch(n=>n+1);
    latest.current=accepted;run21RoundTiming(accepted.view.roundNumber);
    celebrations.current.accept(accepted,recovery||document.hidden,continuousRenewal&&!document.hidden);
    const tick=performance.now();clock.current={server:Math.max(accepted.serverAt,clock.current.server+tick-clock.current.local),local:tick};
    // Live transport is a snapshot, not a replay timeline. The authority owns bot pacing
    // and score holds; missed events remain available in History without delaying play.
    const p=presentation.current;
    p.queue=[];p.sequence=p.received=accepted.eventSequence??p.received;
    p.event=accepted.events?.at(-1)??p.event;p.shownAt=tick;
    const shown=celebrations.current.frame(accepted,accepted.serverAt,tick);setSnapshot(shown.snapshot);setNow(shown.now);

    try{sessionStorage.setItem(storageKey,JSON.stringify({sequence:p.sequence,snapshot:accepted}));}catch{}

  },[dealerGameId,paint,storageKey]);
  useEffect(()=>{
    latest.current=null;presentation.current=new LivePresentation();celebrations.current=new ScoreCelebrations();setSnapshot(null);setError(null);
    clock.current={server:0,local:performance.now()};
    try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');
      if(saved?.snapshot?.view?.identity?.dealerGameId===dealerGameId&&Number.isSafeInteger(saved.sequence)){
        setSnapshot(saved.snapshot);presentation.current.received=saved.sequence;presentation.current.sequence=saved.sequence;
      }
    }catch{/* Recover the recorded prefix when no checkpoint exists. */}
    const display=setInterval(()=>paint(),50);return()=>clearInterval(display);
  },[dealerGameId,storageKey,paint]);
  useEffect(()=>{
    // Reconnect preserves the mounted surface and consumes unseen persisted events.
    const controller=new AbortController();
    const run=async()=>{
      let continuousRenewal=false;
      while(!controller.signal.aborted){
        let renewed=false;
        try{
          const response=await run21Fetch(gameId,`events?dealerGameId=${dealerGameId}&after=${presentation.current.received}`,{signal:controller.signal});
          if(!response.ok||!response.body)throw new Error('Run21 transport unavailable');
          run21Timing('stream-open');setConnected(true);
          const reader=response.body.getReader(),decoder=new TextDecoder();let text='',baseline=true;
          while(!controller.signal.aborted){const {value,done}=await reader.read();if(done)break;
            text+=decoder.decode(value,{stream:true});let end:number;
            while((end=text.indexOf('\n\n'))>=0){
              const frame=text.slice(0,end);text=text.slice(end+2);
              if(frame.startsWith('event: renew'))renewed=true;
              else if(frame.startsWith('data: ')){accept(JSON.parse(frame.slice(6)),false,baseline,continuousRenewal);baseline=false;}
            }
          }
        }catch{/* The canonical shell owns sustained connectivity presentation. */}
        if(controller.signal.aborted)return;
        if(renewed){run21Timing('stream-renew');continuousRenewal=true;continue;}
        continuousRenewal=false;run21Timing('stream-lost');
        celebrations.current.silence();setConnected(false);setAudioEpoch(n=>n+1);
        await new Promise<void>(resolve=>{
          const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};
          const timer=setTimeout(done,1000);controller.signal.addEventListener('abort',done,{once:true});
        });
      }
    };
    void run();return()=>controller.abort();
  },[gameId,dealerGameId,accept,retry]);
  useEffect(()=>{
    const silence=()=>{celebrations.current.silence();refreshPresentation(n=>n+1);};
    const stopRecovery=subscribeAuthoritativeRecoverySnapshot(()=>{setConnected(false);silence();setRetry(n=>n+1);});
    const hidden=()=>{if(document.hidden)silence();};
    window.addEventListener('offline',silence);document.addEventListener('visibilitychange',hidden);
    return()=>{stopRecovery();window.removeEventListener('offline',silence);document.removeEventListener('visibilitychange',hidden);};
  },[dealerGameId]);
  useEffect(()=>{
    if(!authoritativeComplete)return;
    let cancelled=false;
    // The session's authoritative advance proves that this match committed.
    // Catch up its immutable identity once, even if its final SSE notice was lost.
    void run21Request<Run21Snapshot>(gameId,`state?dealerGameId=${dealerGameId}&after=${presentation.current.received}`)
      .then(value=>{if(!cancelled)accept(value);})
      .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not recover Run21 result.');});
    return()=>{cancelled=true;};
  },[gameId,dealerGameId,authoritativeComplete,accept,retry]);
  const action=useRun21Action('multiplayer:'+gameId+':'+dealerGameId,!!snapshot,async command=>{
    const path=`action?after=${presentation.current.received}`;
    try{
      const response=await run21Request<Run21Snapshot>(gameId,path,command);
      if(response.requestId!==command.requestId)throw new UncertainRun21Action('Acknowledgment mismatch.');
      run21SnapshotTiming(command.requestId,response.view,response.events?.length);flushSync(()=>accept(response,true));
    }catch(e){
      if(e instanceof UncertainRun21Action)throw e;
      try{accept(await run21Request<Run21Snapshot>(gameId,`state?dealerGameId=${dealerGameId}&after=${presentation.current.received}`),false,true);}
      catch{throw new UncertainRun21Action('Recovery unavailable.');}
      throw e;
    }
  });
  const onIntent=useCallback(async(intent:Intent)=>{
    const current=latest.current;
    if(!current?.view.viewerId||action.pending||celebrations.current.pending)return;
    const view=current.view,board=view.boards[view.viewerId]!;
    const at=clock.current.server+performance.now()-clock.current.local;
    if(roundIntro(view,at)||view.pausedAt!=null||view.revealed||view.scorePresentation||board.result||(board.deadline!==null&&at>=board.deadline))return;
    if(intent.type==='place'&&(view.active_player_id!==view.viewerId||!legalColumns(board,view.config).includes(intent.column)))return;
    await action.submit({identity:view.identity,roundId:view.roundId!,playerId:view.viewerId,requestId:crypto.randomUUID(),revision:board.revision,intent});
  },[action.pending,action.submit]);
  const retireCelebration=useCallback((key:string)=>{celebrations.current.retire(key,performance.now());refreshPresentation(n=>n+1);paint();},[paint]);
  const shown=snapshot?.view.identity.dealerGameId===dealerGameId?snapshot:null;
  return {snapshot:shown,placement:action.placement,now,
    phase:presentationPhase(shown?.view,now,presentation.current.event?.type),error:error||action.error,connected,audioEpoch,
    celebration:celebrations.current.receipt,retireCelebration,
    pending:action.pending||presentation.current.queue.length>0||celebrations.current.pending,onIntent,reconnect:()=>{void action.recover();setRetry(n=>n+1);}};
}
