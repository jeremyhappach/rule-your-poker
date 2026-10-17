import type {AudioCue} from '@/lib/audio/audioManager';

/** Original approved fallback; not a transcription of the reference recording. */
export function triAllClearCueAt(elapsed=0,remaining=1100):AudioCue{return {durationMs:Math.max(0,remaining-5),schedule(ctx,destination,track){
 if(ctx.state!=='running')return false;
 const notes=[[0,523.25,.14],[.16,659.25,.14],[.32,783.99,.18],[.54,1046.5,.52]];
 for(const [offset,frequency,duration] of notes){
  if((offset+duration)*1000<=elapsed)continue; // Skip elapsed notes; continue an active note without restarting the phrase.
  for(const [harmonic,volume] of [[1,.09],[2,.025],[3,.012]]){
   const at=ctx.currentTime+Math.max(0,offset-elapsed/1000),length=Math.min(duration,offset+duration-elapsed/1000),osc=track(ctx.createOscillator()),gain=track(ctx.createGain());
   osc.type='triangle';osc.frequency.setValueAtTime(frequency*harmonic,at);
   gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+Math.min(.012,length*.15));
   gain.gain.exponentialRampToValueAtTime(.0001,at+length);
   osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+length);
  }
 }
 return true;
}};}
