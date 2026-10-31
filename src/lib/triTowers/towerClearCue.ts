import type {AudioCue} from '@/lib/audio/audioManager';

/** Short rising trills; the existing all-clear owner keeps the full third cue. */
export const towerTrillMs=(ordinal:1|2)=>ordinal===1?360:620;
export function towerClearCueAt(ordinal:1|2,elapsed=0,remaining=towerTrillMs(ordinal)):AudioCue {
 // Match the canonical fanfare's scheduling margin: the manager checks its clock again.
 const durationMs=Math.max(0,Math.min(remaining,towerTrillMs(ordinal)-elapsed)-5);
 return {durationMs,schedule(ctx,destination,track){
  if(ctx.state!=='running'||durationMs<=0)return false;
  const notes=ordinal===1?[60,62,60,62,64]:[67,69,67,69,67,69,72];
  const step=ordinal===1?.055:.07,cursor=Math.max(0,elapsed)/1000,end=cursor+durationMs/1000;
  let scheduled=false;
  notes.forEach((note,index)=>{
   const begin=index*step,finish=index===notes.length-1?towerTrillMs(ordinal)/1000:begin+step;
   const start=Math.max(cursor,begin),stop=Math.min(end,finish);if(stop<=start)return;
   // Seek into the current note; never replay elapsed notes after audio unlock.
   for(let voice=0;voice<ordinal;voice++){
    const osc=track(ctx.createOscillator()),gain=track(ctx.createGain());
    const at=ctx.currentTime+start-cursor,off=ctx.currentTime+stop-cursor;
    osc.type=voice?'sine':'triangle';osc.frequency.setValueAtTime(440*Math.pow(2,(note+(voice?7:0)-69)/12),at);
    const level=(ordinal===1?.055:.075)*(voice?.45:1),fade=Math.min(.018,(off-at)/3);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(level,at+fade);
    gain.gain.setValueAtTime(level,off-fade);gain.gain.exponentialRampToValueAtTime(.0001,off);
    osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(off);scheduled=true;
   }
  });
  return scheduled;
 }};
}
