import {useCallback,useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {acceptRun21Snapshot,run21Fetch,run21Request,type Run21Snapshot} from '@/lib/run21/localClient';
import {eventSnapshot,LivePresentation,optimisticPlacement,presentationPhase} from '@/lib/run21/livePresentation';
import {legalColumns} from '@/lib/run21/rules';
import type {Command,Intent} from '@/lib/run21/model';
export function useRun21Local(gameId:string,dealerGameId:string) {
  const [snapshot,setSnapshot]=useState<Run21Snapshot|null>(null),latest=useRef<Run21Snapshot|null>(null);
  const presentation=useRef(new LivePresentation());
  const [error,setError]=useState<string|null>(null),[connected,setConnected]=useState(false),[pending,setPending]=useState(false);
  const [optimistic,setOptimistic]=useState<Command|null>(null),inFlight=useRef(false),[retry,setRetry]=useState(0);
  const clock=useRef({server:0,local:0}),[now,setNow]=useState(0);
  const storageKey=`run21-presentation:${gameId}:${dealerGameId}`;
  const paint=useCallback((live=false)=>{
    const p=presentation.current,tick=performance.now(),event=p.advance(tick,live);
    if(event&&latest.current){
      const shown=eventSnapshot(latest.current,event);setSnapshot(shown);
      try{sessionStorage.setItem(storageKey,JSON.stringify({sequence:p.sequence,snapshot:shown}));}catch{/* Optional checkpoint. */}
    }
    const liveNow=clock.current.server+tick-clock.current.local;
    setNow(p.queue.length&&p.event?Math.min(p.queue[0].at,p.event.at+tick-p.shownAt):liveNow);
  },[storageKey]);
  const accept=useCallback((value:Run21Snapshot, actionResponse=false)=>{
    const accepted=acceptRun21Snapshot(latest.current,value,dealerGameId);
    if(!accepted||accepted!==value)return;
    latest.current=accepted;
    const tick=performance.now();clock.current={server:Math.max(accepted.serverAt,clock.current.server+tick-clock.current.local),local:tick};
    // Live transport is a snapshot, not a replay timeline. The authority owns bot pacing
    // and score holds; missed events remain available in History without delaying play.
    const p=presentation.current;
    p.queue=[];p.sequence=p.received=accepted.eventSequence??p.received;
    p.event=accepted.events?.at(-1)??p.event;p.shownAt=tick;
    setSnapshot(accepted);setNow(accepted.serverAt);
    if(actionResponse)setOptimistic(null);
    try{sessionStorage.setItem(storageKey,JSON.stringify({sequence:p.sequence,snapshot:accepted}));}catch{}

  },[dealerGameId,paint,storageKey]);
  useEffect(()=>{
    latest.current=null;presentation.current=new LivePresentation();setSnapshot(null);setError(null);
    inFlight.current=false;setPending(false);setOptimistic(null);clock.current={server:0,local:performance.now()};
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
      while(!controller.signal.aborted){
        let renewed=false;
        try{
          const response=await run21Fetch(gameId,`events?after=${presentation.current.received}`,{signal:controller.signal});
          if(!response.ok||!response.body)throw new Error('Run21 transport unavailable');
          setConnected(true);
          const reader=response.body.getReader(),decoder=new TextDecoder();let text='';
          while(!controller.signal.aborted){const {value,done}=await reader.read();if(done)break;
            text+=decoder.decode(value,{stream:true});let end:number;
            while((end=text.indexOf('\n\n'))>=0){
              const frame=text.slice(0,end);text=text.slice(end+2);
              if(frame.startsWith('event: renew'))renewed=true;
              else if(frame.startsWith('data: '))accept(JSON.parse(frame.slice(6)));
            }
          }
        }catch{/* The canonical shell owns sustained connectivity presentation. */}
        if(controller.signal.aborted)return;
        if(renewed)continue;
        setConnected(false);
        await new Promise<void>(resolve=>{
          const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};
          const timer=setTimeout(done,1000);controller.signal.addEventListener('abort',done,{once:true});
        });
      }
    };
    void run();return()=>controller.abort();
  },[gameId,dealerGameId,accept,retry]);
  const onIntent=useCallback(async(intent:Intent)=>{
    const current=latest.current;
    if(!current?.view.viewerId||inFlight.current)return;
    const view=current.view,board=view.boards[view.viewerId]!;
    if(intent.type==='place'&&(view.active_player_id!==view.viewerId||!legalColumns(board,view.config).includes(intent.column)))return;
    const command:Command={identity:view.identity,roundId:view.roundId!,playerId:view.viewerId,requestId:crypto.randomUUID(),revision:board.revision,intent};
    inFlight.current=true;setPending(true);setError(null);setOptimistic(command);
    try{let response:Run21Snapshot;const path=`action?after=${presentation.current.received}`;
      try{response=await run21Request(gameId,path,command);}catch(e){if(!(e instanceof TypeError))throw e;response=await run21Request(gameId,path,command);}
      if(response.requestId!==command.requestId)throw new Error('Run21 action acknowledgment mismatch.');
      flushSync(()=>accept(response,true));
    }catch(e){setOptimistic(null);setError(e instanceof Error?e.message:'Action rejected.');}
    finally{inFlight.current=false;setPending(false);}
  },[gameId,accept]);
  const shown=snapshot?.view.identity.dealerGameId===dealerGameId?snapshot:null;
  return {snapshot:shown?{...shown,view:optimisticPlacement(shown.view,optimistic)}:null,now,
    phase:presentationPhase(shown?.view,now,presentation.current.event?.type),error,connected,
    pending:pending||presentation.current.queue.length>0,onIntent,reconnect:()=>setRetry(n=>n+1)};
}
