import type {AudioCue} from '../audio/audioManager';

export const TAKE_TWO_CLEAR_MS=3000;
// Bright alternating chip tones and a resolving chime, distinct from TriTowers' brass.
const notes=[0,4,7,12,7,12,16,19,12,16,19,24].map((pitch,i)=>({at:i*150,pitch,duration:220}));
const chime=[12,16,19,24].map(pitch=>({at:1900,pitch,duration:1050}));
export function takeTwoAllClearCueAt(elapsed=0,remaining=TAKE_TWO_CLEAR_MS):AudioCue{
 const durationMs=Math.max(0,Math.min(remaining,TAKE_TWO_CLEAR_MS-elapsed)-5);
 return {durationMs,schedule(ctx,destination,track){
  if(ctx.state!=='running'||durationMs<=0)return false;
  let scheduled=false;
  for(const [i,note] of [...notes,...chime].entries()){
   // Late unlock seeks forward. Never replay an attack that already elapsed.
   if(note.at<elapsed||note.at>=elapsed+durationMs)continue;
   const at=ctx.currentTime+(note.at-elapsed)/1000,end=at+Math.min(note.duration,elapsed+durationMs-note.at)/1000;
   const osc=track(ctx.createOscillator()),gain=track(ctx.createGain());
   osc.type=i<notes.length?(i%2?'triangle':'square'):'sine';
   osc.frequency.setValueAtTime(523.25*2**(note.pitch/12),at);
   gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(i<notes.length?.035:.055,Math.min(at+.008,end));
   gain.gain.exponentialRampToValueAtTime(.0001,end);
   osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(end);scheduled=true;
  }
  return scheduled;
 }};
}
