import type {AudioCue} from '@/lib/audio/audioManager';
export function tripFlipClearCue(special:boolean):AudioCue{return {durationMs:special?1100:330,schedule(ctx,destination,track){
 if(ctx.state!=='running')return false;
 const notes=special?[523,659,784,1047,1319]:[440,660,880];
 notes.forEach((frequency,i)=>{const oscillator=track(ctx.createOscillator()),gain=track(ctx.createGain()),at=ctx.currentTime+i*(special?.15:.065);oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.13,at+.009);gain.gain.exponentialRampToValueAtTime(.0001,at+(special?.35:.18));oscillator.connect(gain);gain.connect(destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+(special?.36:.19));});return true;
}};}
