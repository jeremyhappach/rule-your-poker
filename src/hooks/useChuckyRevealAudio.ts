import {useCallback,useEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import type {AudioCue} from '@/lib/audio/audioManager';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';

// A steady 96 BPM recording, independent of every card's reveal delay.
export const CHUCKY_HEARTBEAT_INTERVAL_MS = 625;
const FINAL_QUIET_MS = 40;
const LATE_PULSE_MS = 100;

/** The first visible flip admits one sequence; its heartbeat clock never follows individual flips. */
export function useChuckyRevealAudio(identity:string|null|undefined,cue?:AudioCue|(()=>AudioCue|undefined),heartbeat=false) {
  const stopRef=useRef<()=>void>(()=>{}),seen=useRef<string|null>(null);
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const firstBeatAt=useRef<number|null>(null),finalFlipAt=useRef(Infinity);
  const [active,setActive]=useState(false);
  const stop=useCallback(()=>{if(timerRef.current!==null)clearTimeout(timerRef.current);timerRef.current=null;stopRef.current();stopRef.current=()=>{};setActive(false);},[]);
  // Called by the existing presentation scheduler when it arms a card. It changes audio only.
  const armReveal=useCallback((index:number,total:number,delayMs:number)=>{
    // Only the actually armed final card can end the sequence. Intermediate
    // cards neither change its tempo nor predict how long later cards will take.
    if(index===total-1)finalFlipAt.current=performance.now()+delayMs;
  },[]);
  useEffect(()=>{
    firstBeatAt.current=null;finalFlipAt.current=Infinity;
    const retire=()=>{if(identity)seen.current=identity;stop();};
    const hidden=()=>{if(document.hidden)retire();};
    window.addEventListener('pagehide',retire);window.addEventListener('offline',retire);document.addEventListener('visibilitychange',hidden);
    const unsubscribe=platformAudio.subscribe(()=>{if(platformAudio.getSnapshot().enabled!==true)stop();});
    return()=>{stop();unsubscribe();window.removeEventListener('pagehide',retire);window.removeEventListener('offline',retire);document.removeEventListener('visibilitychange',hidden);};
  },[identity,stop]);
  const start=useCallback((surface:Element)=>{
    if(!identity||seen.current===identity)return;
    seen.current=identity;
    const {userId}=platformAudio.getSnapshot();
    if(!userId)return;
    const resolvedCue=typeof cue==='function'?cue():cue;
    const admittedCue=isSoundSurfaceVisible(surface)?resolvedCue:undefined;
    if(!heartbeat){
      platformAudio.present({userId,id:'chucky-reveal:'+identity,cue:admittedCue},cancel=>{stopRef.current=cancel;setActive(true);});
      return;
    }
    firstBeatAt.current=performance.now();
    const pulse=(index:number)=>{
      const due=firstBeatAt.current!+index*CHUCKY_HEARTBEAT_INTERVAL_MS;
      const now=performance.now();
      // Finish a whole lub-dub with a quiet gap before the final flip. Never cut a pair to fit.
      if(!admittedCue||now+admittedCue.durationMs>finalFlipAt.current-FINAL_QUIET_MS){
        if(index===0)platformAudio.present({userId,id:'chucky-reveal:'+identity});
        stop();return;
      }
      // Skip a genuinely missed pulse on the same clock. A busy foreground
      // frame must not permanently silence the remainder or play a catch-up burst.
      if(index>0&&now-due>LATE_PULSE_MS){
        const nextIndex=Math.floor((now-firstBeatAt.current!)/CHUCKY_HEARTBEAT_INTERVAL_MS)+1;
        timerRef.current=setTimeout(()=>pulse(nextIndex),Math.max(0,firstBeatAt.current!+nextIndex*CHUCKY_HEARTBEAT_INTERVAL_MS-now));
        return;
      }
      const played=platformAudio.present({userId,id:'chucky-reveal:'+identity+(index?':beat:'+index:''),cue:admittedCue},cancel=>{stopRef.current=cancel;setActive(true);});
      if(!played){stop();return;}
      const nextDue=firstBeatAt.current!+(index+1)*CHUCKY_HEARTBEAT_INTERVAL_MS;
      if(nextDue+admittedCue.durationMs>finalFlipAt.current-FINAL_QUIET_MS){
        timerRef.current=setTimeout(stop,admittedCue.durationMs);
      }else{
        timerRef.current=setTimeout(()=>pulse(index+1),Math.max(0,nextDue-performance.now()));
      }
    };
    pulse(0);
  },[identity,cue,heartbeat,stop]);
  return {start,stop,active,armReveal};
}
