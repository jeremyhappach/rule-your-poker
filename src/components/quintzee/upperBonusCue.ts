import type {AudioCue} from '@/lib/audio/audioManager';
/** Short major arpeggio, scheduled by the canonical cancellable audio owner. */
export function upperBonusCueAt(elapsed=0,remaining=1500):AudioCue {
 const durationMs=Math.max(0,Math.min(remaining,1500-elapsed)-5);
 return {durationMs,schedule(ctx,destination,track){
  if(ctx.state!=='running'||durationMs<=0)return false;
  let scheduled=false;const cursor=elapsed/1000,limit=(elapsed+durationMs)/1000;
  for(const [offset,hz,length] of [[0,523.25,.3],[.18,659.25,.3],[.36,783.99,.35],[.6,1046.5,.85]]){
   const start=Math.max(offset,cursor),end=Math.min(offset+length,limit);if(start>=end)continue;
   const osc=track(ctx.createOscillator()),gain=track(ctx.createGain()),at=ctx.currentTime+start-cursor;
   osc.type='sine';osc.frequency.setValueAtTime(hz,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+end-cursor);
   osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(ctx.currentTime+end-cursor);scheduled=true;
  }
  return scheduled;
 }};
}
