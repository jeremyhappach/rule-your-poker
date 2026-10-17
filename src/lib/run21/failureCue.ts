import type {AudioCue} from '@/lib/audio/audioManager';

export const RUN21_FAILURE_CUE_MS = 1100;

/** Original two-note muted-brass fall: a short wah, then a lower, longer wah. */
export function run21FailureCueAt(elapsedMs:number,remainingMs:number):AudioCue {
  const durationMs=Math.max(0,Math.min(RUN21_FAILURE_CUE_MS-elapsedMs,remainingMs)-2);
  return {durationMs,schedule(context,destination,track){
    // Unlock/unmute must not start a detached failure sound after its visible onset.
    if(elapsedMs<0||elapsedMs>80||remainingMs<RUN21_FAILURE_CUE_MS-elapsedMs)return false;
    const origin=context.currentTime;
    const notes=[{offset:0,duration:.35,from:196,to:174.61},{offset:.45,duration:.648,from:164.81,to:130.81}];
    for(const note of notes){
      const start=origin+note.offset,end=Math.min(start+note.duration,origin+durationMs/1000);
      const oscillator=track(context.createOscillator()),filter=track(context.createBiquadFilter()),gain=track(context.createGain());
      oscillator.type='sawtooth';
      oscillator.frequency.setValueAtTime(note.from,start);
      oscillator.frequency.exponentialRampToValueAtTime(note.to,end);
      filter.type='lowpass';filter.Q.value=1.3;
      filter.frequency.setValueAtTime(350,start);
      filter.frequency.exponentialRampToValueAtTime(1100,start+.065);
      filter.frequency.exponentialRampToValueAtTime(260,end);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(.2,start+.025);
      gain.gain.setValueAtTime(.2,end-.12);
      gain.gain.exponentialRampToValueAtTime(.0001,end-.005);
      gain.gain.linearRampToValueAtTime(0,end);
      oscillator.connect(filter);filter.connect(gain);gain.connect(destination);
      oscillator.start(start);oscillator.stop(end);
    }
    return true;
  }};
}
