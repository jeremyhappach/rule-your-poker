import type {AudioCue} from '@/lib/audio/audioManager';

/** Soft air sweep, admitted only alongside a live confirmed card flight. */
export function cardSwooshCueAt(elapsedMs:number,remainingMs:number):AudioCue {
 const durationMs=Math.max(0,Math.min(100,remainingMs)-2);
 return {durationMs,schedule(context,destination,track){
  // Audio unlocking late must not produce a detached swoosh after the card lands.
  if(elapsedMs>25||remainingMs<50)return false;
  const duration=durationMs/1000,t=context.currentTime;
  const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),samples=buffer.getChannelData(0);
  let seed=1831565813;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;samples[i]=(seed>>>0)/2147483648-1;}
  const source=track(context.createBufferSource()),filter=track(context.createBiquadFilter()),gain=track(context.createGain());
  source.buffer=buffer;filter.type='bandpass';filter.Q.value=.65;
  filter.frequency.setValueAtTime(2400,t);filter.frequency.exponentialRampToValueAtTime(650,t+duration);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.16,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.connect(filter);filter.connect(gain);gain.connect(destination);source.start(t);source.stop(t+duration);return true;
 }};
}
