import type {AudioCue} from '@/lib/audio/audioManager';
/** Original synthesized cues, routed through the shared mute/audio owner. */
export function racePokerCue(kind:'card'|'hoof'|'warning'|'victory'):AudioCue {
 const notes=kind==='victory'?[392,523,659,784,659,1047]:kind==='hoof'?[110,85,110,85]:kind==='warning'?[660,440]:[180];
 const step=kind==='victory'?.19:kind==='hoof'?.16:.06;
 return {durationMs:kind==='victory'?1500:kind==='hoof'?850:250,schedule(ctx,destination,track){
  if(ctx.state!=='running')return false;
  notes.forEach((frequency,i)=>{
   const oscillator=track(ctx.createOscillator()),gain=track(ctx.createGain()),at=ctx.currentTime+i*step,duration=kind==='victory'?.25:.075;
   oscillator.type=kind==='victory'?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,at);
   gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.09,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   oscillator.connect(gain);gain.connect(destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+duration+.01);
  });return true;
 }};
}
