import type {AudioCue} from '@/lib/audio/audioManager';

/** Short, soft burst for a dismissed wrong row. */
export const fiveAlivePoof:AudioCue={durationMs:210,schedule(context,destination,track){
 if(context.state!=='running')return false;
 const oscillator=track(context.createOscillator()),gain=track(context.createGain()),at=context.currentTime;
 oscillator.type='triangle';oscillator.frequency.setValueAtTime(420,at);oscillator.frequency.exponentialRampToValueAtTime(90,at+.18);
 gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.08,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.2);
 oscillator.connect(gain);gain.connect(destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+.21);return true;
}};
