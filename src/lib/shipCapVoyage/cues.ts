import type {AudioCue} from '@/lib/audio/audioManager';
export const cargoBankCue:AudioCue={durationMs:320,policy:{priority:60,group:'voyage-bank',intervalMs:0},schedule(ctx,destination,track){
 [660,880].forEach((hz,i)=>{const at=ctx.currentTime+i*.08,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());
  osc.frequency.value=hz;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.06,at+.01);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);
  osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+.23);
 });
 return true;
}};
