import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {towerClearCueAt,towerTrillMs} from '@/lib/triTowers/towerClearCue';

interface Props {scope:string;userId:string;removed:readonly number[];phase:string;recoveryEpoch:number;active:boolean;reduced:boolean;replay:boolean}
interface Cue {id:string;ordinal:1|2;startedAt:number}
/** Presentation of confirmed tower deltas only. Never changes or gates an action. */
export function useTriTowerClearAudio({scope,userId,removed,phase,recoveryEpoch,active,reduced,replay}:Props){
 const prior=useRef<{scope:string;userId:string;epoch:number;active:boolean;phase:string;cleared:number[]}|null>(null);
 const [cues,setCues]=useState<Cue[]>([]);
 useLayoutEffect(()=>{
  const p=prior.current,cleared=removed.filter(i=>i>=0&&i<3);
  const enabled=active&&!reduced&&!replay&&!document.hidden;
  const same=p?.scope===scope&&p.userId===userId&&p.epoch===recoveryEpoch;
  const continuous=same&&enabled&&p.active;
  if(!continuous)setCues([]);
  // Retain the high-water mark across regressive snapshots in the same scope.
  const regressive=same&&p.cleared.some(tower=>!cleared.includes(tower));
  if(continuous&&!regressive&&['ready','playing'].includes(p.phase)){
   const fresh=cleared.flatMap((tower,index)=>!p.cleared.includes(tower)&&index<2?
    [{id:`tri-tower:${scope}:${tower}:${index+1}`,ordinal:(index+1) as 1|2,startedAt:performance.now()}]:[]);
   if(fresh.length)setCues(old=>[...old,...fresh]);
  }
  prior.current={scope,userId,epoch:recoveryEpoch,active:enabled,phase,cleared:regressive?p.cleared:cleared};
 },[scope,userId,removed,phase,recoveryEpoch,active,reduced,replay]);
 useEffect(()=>{
  const stops=cues.map(cue=>platformAudio.follow({userId,id:cue.id,startedAt:cue.startedAt,
   expiresAt:cue.startedAt+towerTrillMs(cue.ordinal),cueAt:(elapsed,remaining)=>towerClearCueAt(cue.ordinal,elapsed,remaining)}));
  return()=>stops.forEach(stop=>stop());
 },[cues,userId]);
 useEffect(()=>{
  const retire=()=>{prior.current=null;setCues([]);};
  const hidden=()=>{if(document.hidden)retire();};
  window.addEventListener('offline',retire);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('offline',retire);document.removeEventListener('visibilitychange',hidden);};
 },[]);
}
