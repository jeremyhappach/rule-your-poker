import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedCountdownBeat,approvedSound} from '@/lib/audio/approvedSounds';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {towerClearCueAt} from '@/lib/triTowers/towerClearCue';
import {triAllClearCueAt} from '@/lib/triTowers/allClearCue';
import {run21FailureCueAt} from '@/lib/run21/failureCue';
import type {DropSnapshot} from '@/lib/drop357/model';
export function useDrop357Audio(userId:string,v:DropSnapshot|null,liveLanes:number[],now:number,surface:React.RefObject<HTMLDivElement>){
 const seen=useRef(new Set<string>()),stops=useRef(new Set<()=>void>()),lastSecond=useRef<number|null>(null);
 const preceding=useRef<DropSnapshot|null>(null);
 useEffect(()=>{
  if(!v)return;
  const audible=isSoundSurfaceVisible(surface.current);
  const before=preceding.current;preceding.current=v;
  if(before&&v.placements>before.placements&&v.current!==null&&audible){
   const cue=approvedSound('flip'),local=performance.now();
   if(cue)stops.current.add(platformAudio.follow({userId,id:v.id+':reveal:'+v.placements,startedAt:local+140,expiresAt:local+140+cue.durationMs,
    cueAt:()=>({...cue,policy:{priority:20,group:'357-reveal',intervalMs:0}})}));
  }
  v.laneResults.forEach((result,i)=>{
   if(!result)return;const id=v.id+':lane:'+i;
   if(seen.current.has(id))return;
   const elapsed=now-result.completedAt;
   if(!liveLanes.includes(i)||!audible||elapsed>1300){seen.current.add(id);return;}
   // Let the accepted placement sound finish; this never gates another placement.
   if(elapsed<180)return;seen.current.add(id);
   const local=performance.now();
   const duration=result.score===0?1100:i===0?360:620;
   const stop=platformAudio.follow({userId,id:'357:'+id,startedAt:local,expiresAt:local+duration,
    cueAt:(at,left)=>result.score===0?run21FailureCueAt(at,left):i===2?triAllClearCueAt(2100+at,left):towerClearCueAt((i+1) as 1|2,at,left)});
   stops.current.add(stop);
  });
  const seconds=Math.ceil((v.deadline-now)/1000),previous=lastSecond.current;lastSecond.current=seconds;
  if(v.status==='active'&&seconds>=1&&seconds<=3&&previous!==null&&previous===seconds+1){
   platformAudio.present({userId,id:v.id+':countdown:'+seconds,cue:audible?approvedCountdownBeat('3')??approvedSound('peg'):undefined});
  }
 },[userId,v,liveLanes,now,surface]);
 useEffect(()=>{const cancel=()=>{stops.current.forEach(stop=>stop());stops.current.clear();lastSecond.current=null;preceding.current=null;};
  document.addEventListener('visibilitychange',cancel);window.addEventListener('offline',cancel);
  return()=>{cancel();document.removeEventListener('visibilitychange',cancel);window.removeEventListener('offline',cancel);};
 },[]);
}
