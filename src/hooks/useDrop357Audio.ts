import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedCountdownBeat,approvedSound} from '@/lib/audio/approvedSounds';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {dropCompletionCue} from '@/lib/drop357/audio';
import type {DropSnapshot} from '@/lib/drop357/model';
export function useDrop357Audio(userId:string,v:DropSnapshot|null,liveLanes:number[],now:number,surface:React.RefObject<HTMLDivElement>){
 const seen=useRef(new Set<string>()),stops=useRef(new Set<()=>void>()),lastSecond=useRef<number|null>(null);
 const preceding=useRef<DropSnapshot|null>(null);
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
  v.laneResults.forEach((result,i)=>{
   if(!result)return;const id=v.roundId+':lane:'+i;
   if(seen.current.has(id))return;
   const elapsed=now-result.completedAt;
   if(!liveLanes.includes(i)||!audible||elapsed>1300){seen.current.add(id);return;}
   // Let the accepted placement sound finish; this never gates another placement.
   if(elapsed<180)return;seen.current.add(id);
   const filled=v.placements===15&&v.result?.reason==='filled'&&result.completedAt===v.result.completedAt;
   const local=performance.now(),start=local-elapsed+180,end=start+(filled?850:320);
   if(end<=local)return;
   stops.current.add(platformAudio.follow({userId,id:filled?'357-filled:'+v.roundId:'357-lane:'+id,startedAt:start,expiresAt:end,
    cueAt:(at,left)=>dropCompletionCue(filled,at,left)}));
  });
  const seconds=Math.ceil((v.deadline-now)/1000),previous=lastSecond.current;lastSecond.current=seconds;
  if(v.phase==='playing'&&seconds>=1&&seconds<=3&&previous!==null&&previous===seconds+1){
   platformAudio.present({userId,id:v.roundId+':countdown:'+seconds,cue:audible?approvedCountdownBeat('3')??approvedSound('peg'):undefined});
  }
 },[userId,v,liveLanes,now,surface]);
 useEffect(()=>{const cancel=()=>{stops.current.forEach(stop=>stop());stops.current.clear();lastSecond.current=null;preceding.current=null;};
  document.addEventListener('visibilitychange',cancel);window.addEventListener('offline',cancel);
  return()=>{cancel();document.removeEventListener('visibilitychange',cancel);window.removeEventListener('offline',cancel);};
 },[]);
}
