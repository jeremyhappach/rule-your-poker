import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedCountdownBeat,approvedSound} from '@/lib/audio/approvedSounds';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {dropCompletionCue} from '@/lib/drop357/audio';
import type {DropSnapshot} from '@/lib/drop357/model';
export function useDrop357Audio(userId:string,v:DropSnapshot|null,liveLanes:number[],now:number,surface:React.RefObject<HTMLDivElement>){
 const seen=useRef(new Set<string>()),stops=useRef(new Set<()=>void>()),lastSecond=useRef<number|null>(null);
 const ordinaryStops=useRef(new Set<()=>void>()),preceding=useRef<DropSnapshot|null>(null);
 useEffect(()=>{
  if(!v)return;
  const audible=isSoundSurfaceVisible(surface.current);
  const before=preceding.current;preceding.current=v;
  if(before?.roundId!==v.roundId)lastSecond.current=null;
  if(before?.roundId===v.roundId&&v.placements>before.placements&&v.current!==null&&audible){
   const cue=approvedSound('flip'),local=performance.now();
   if(cue)stops.current.add(platformAudio.follow({userId,id:v.roundId+':reveal:'+v.placements,startedAt:local+140,expiresAt:local+140+cue.durationMs,
    cueAt:()=>({...cue,policy:{priority:20,group:'357-reveal',intervalMs:0}})}));
  }
  const full=!!v.result&&v.result.allBonus>0;
  if(full){
   ordinaryStops.current.forEach(stop=>stop());ordinaryStops.current.clear();
   const id='357-filled:'+v.roundId,elapsed=now-v.result!.completedAt;
   if(!seen.current.has(id)&&elapsed>=180){
    seen.current.add(id);
    const fresh=v.laneResults.some((r,i)=>r?.completedAt===v.result!.completedAt&&liveLanes.includes(i));
    if(fresh&&audible&&elapsed<1030){const local=performance.now(),start=local-elapsed+180;
     stops.current.add(platformAudio.follow({userId,id,startedAt:start,expiresAt:start+850,cueAt:(at,left)=>dropCompletionCue(true,at,left)}));}
   }
  }
  v.laneResults.forEach((result,i)=>{
   if(!result)return;const id=v.roundId+':lane:'+i;
   if(seen.current.has(id))return;
   const elapsed=now-result.completedAt;
   if(full||!liveLanes.includes(i)||!audible||elapsed>500){seen.current.add(id);return;}
   if(elapsed<180)return;seen.current.add(id);
   const local=performance.now(),start=local-elapsed+180;
   const stop=platformAudio.follow({userId,id:'357-lane:'+id,startedAt:start,expiresAt:start+320,
    cueAt:(at,left)=>dropCompletionCue(false,at,left)});stops.current.add(stop);ordinaryStops.current.add(stop);
  });
  const seconds=Math.ceil((v.deadline-now)/1000),previous=lastSecond.current;lastSecond.current=seconds;
  if(v.phase==='playing'&&seconds>=1&&seconds<=3&&previous!==null&&previous===seconds+1){
   platformAudio.present({userId,id:v.roundId+':countdown:'+seconds,cue:audible?approvedCountdownBeat('3')??approvedSound('peg'):undefined});
  }
 },[userId,v,liveLanes,now,surface]);
 useEffect(()=>{const cancel=()=>{stops.current.forEach(stop=>stop());stops.current.clear();ordinaryStops.current.clear();lastSecond.current=null;preceding.current=null;};
  document.addEventListener('visibilitychange',cancel);window.addEventListener('offline',cancel);
  return()=>{cancel();document.removeEventListener('visibilitychange',cancel);window.removeEventListener('offline',cancel);};
 },[]);
}
