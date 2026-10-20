import type {AudioCue} from '@/lib/audio/audioManager';
/** Short original synthesized conveyor/clunk and order chimes; shared audio owner. */
export function boxdropCue(label:string):AudioCue{return {durationMs:380,schedule(ctx,destination,track){
 if(ctx.state!=='running')return false;
 const order=/complete|closed/i.test(label),broken=/overload/i.test(label);
 const notes=order?[440,660,880]:broken?[160,95]:label==='Recycled'?[240,300]:[120];
 notes.forEach((frequency,i)=>{const oscillator=track(ctx.createOscillator()),gain=track(ctx.createGain()),at=ctx.currentTime+i*.07;
 oscillator.type=order?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,at);oscillator.frequency.exponentialRampToValueAtTime(frequency*(order?1:.6),at+.12);
 gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
 oscillator.connect(gain);gain.connect(destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+.19);});return true;
}};}
