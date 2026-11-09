import type {AudioCue} from '@/lib/audio/audioManager';

// Short, damped impacts through the platform's single Sounds-controlled engine.
function impact(frequency:number,body:number,durationMs:number):AudioCue {
 return {durationMs,schedule(ctx,destination,track){
  const at=ctx.currentTime,gain=track(ctx.createGain()),tone=track(ctx.createOscillator());
  tone.type='triangle';tone.frequency.setValueAtTime(frequency,at);
  tone.frequency.exponentialRampToValueAtTime(frequency*.45,at+durationMs/1000);
  gain.gain.setValueAtTime(body,at);gain.gain.exponentialRampToValueAtTime(.001,at+durationMs/1000);
  tone.connect(gain);gain.connect(destination);tone.start(at);tone.stop(at+durationMs/1000);
  return true;
 }};
}
export const elevenSelectCue=impact(1150,.075,42);
export const elevenDeselectCue=impact(820,.06,48);
export const elevenLandingCue=impact(380,.16,105);
