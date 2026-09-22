import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ReplayPackageV1 } from '@/lib/replay/contractV1';
import { seekReplay } from '@/lib/run21/history';
import type { Projection } from '@/lib/run21/model';

export function Run21Replay({replay,renderFrame}:{replay:ReplayPackageV1;renderFrame:(view:Projection,now:number,controls:ReactNode)=>ReactNode}) {
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(false);
  const bounded=Math.min(index,replay.steps.length-1);
  const view=useMemo(()=>seekReplay(replay,bounded),[replay,bounded]);
  useEffect(()=>{setIndex(0);setPlaying(false);},[replay]);
  useEffect(()=>{
    if(!playing) return;
    if(bounded===replay.steps.length-1) {setPlaying(false);return;}
    const timer=setTimeout(()=>setIndex(n=>n+1),450);
    return ()=>clearTimeout(timer);
  },[playing,bounded,replay.steps.length]);
  const step=replay.steps[bounded];
  const now=Number(step.substeps[0]?.operands.at??0);
  const controls=<div className="run21-replay">
    <nav aria-label="Replay controls">
      <button onClick={()=>{setPlaying(false);setIndex(n=>Math.max(0,n-1));}} disabled={bounded===0}>Previous</button>
      <button onClick={()=>{if(bounded===replay.steps.length-1)setIndex(0);setPlaying(p=>!p);}}>{playing?'Pause':'Play'}</button>
      <button onClick={()=>{setPlaying(false);setIndex(n=>Math.min(replay.steps.length-1,n+1));}} disabled={bounded===replay.steps.length-1}>Next</button>
      <input aria-label="Seek replay" type="range" min={0} max={replay.steps.length-1} value={bounded} onChange={e=>{setPlaying(false);setIndex(+e.target.value);}}/>
    </nav>
    <p>{bounded+1} / {replay.steps.length} · {step.substeps[0]?.type.replace(/_/g,' ')} · recorded time {now} ms</p>
  </div>;
  return renderFrame(view,now,controls);
}
