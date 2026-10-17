import type {AudioCue} from '@/lib/audio/audioManager';
export const TRI_FANFARE_MS=1700;
/** Original rising brass, low horns, final major chord, chime and soft timpani. */
export function triAllClearCueAt(elapsed=0,remaining=TRI_FANFARE_MS):AudioCue{return {durationMs:Math.max(0,remaining-5),schedule(ctx,destination,track){
 if(ctx.state!=='running')return false;
 const notes:[number,number,number,OscillatorType,number][]=[];
 for(const [offset,freq,duration] of [[0,523.25,.19],[.22,659.25,.19],[.44,783.99,.23],[.76,1046.5,.88]]){
  notes.push([offset,freq,duration,'triangle',.065],[offset,freq/2,duration,'sawtooth',.018],[offset,freq*2,duration,'sine',.012]);
 }
 for(const freq of [261.63,329.63,392])notes.push([.76,freq,.88,'triangle',.022]);
 notes.push([.78,2093,.85,'sine',.018],[0,70,.16,'sine',.045],[.76,55,.24,'sine',.045]);
 for(const [offset,frequency,duration,type,volume] of notes){
  const delay=Math.max(0,offset-elapsed/1000),length=Math.min(duration,offset+duration-elapsed/1000,(remaining-5)/1000-delay);
  if(length<=0)continue;
  const at=ctx.currentTime+delay,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());
  osc.type=type;osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);
  gain.gain.exponentialRampToValueAtTime(volume,at+Math.min(.018,length*.15));gain.gain.exponentialRampToValueAtTime(.0001,at+length);
  osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+length);
 }
 return true;
}};}
