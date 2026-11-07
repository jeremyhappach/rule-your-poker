import type {AudioCue} from '@/lib/audio/audioManager';
/** 357's soft electric-piano dyad and rising four-note board cadence.
 * Neither cue uses TriTowers recordings or its tower pitch progression. */
export function dropCompletionCue(filled:boolean,elapsedMs=0,remainingMs=Infinity):AudioCue{
 const notes=filled?[392,493.88,587.33,783.99]:[349.23,440];
 const elapsed=Math.max(0,elapsedMs)/1000,durationMs=Math.max(1,Math.min((filled?850:320)-elapsedMs,remainingMs-4));
 return {durationMs,policy:{priority:65,group:'357-completion',intervalMs:0},schedule(ctx,destination,track){
  let played=false;
  notes.forEach((hz,i)=>{
   const offset=i*(filled?.13:.045),tail=offset+(filled?.42:.23);
   if(tail<=elapsed)return;
   const at=ctx.currentTime+Math.max(0,offset-elapsed),end=ctx.currentTime+Math.min(tail-elapsed,durationMs/1000);
   if(end<=at+.01)return;played=true;
   const tone=track(ctx.createOscillator()),gain=track(ctx.createGain());
   tone.type='triangle';tone.frequency.value=hz;
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(filled?.045:.032,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,end);
   tone.connect(gain);gain.connect(destination);tone.start(at);tone.stop(end+.01);
  });return played;
 }};
}
