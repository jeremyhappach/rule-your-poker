import type {AudioCue} from '@/lib/audio/audioManager';
import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {CHESS_FORFEIT_SETTLEMENT_MS} from './forfeitPresentation';

// Procedural version of the approved impact and descending minor lament.
// The platform owns preference, unlock, cancellation and durable sound receipts.
export function forfeitCue(elapsed=0):AudioCue{
 return {durationMs:Math.max(1,CHESS_FORFEIT_SETTLEMENT_MS-elapsed),schedule(ac,destination,track){
  const offset=elapsed/1000,now=ac.currentTime;
  const master=track(ac.createGain());master.gain.value=.38;master.connect(destination);
  master.gain.setValueAtTime(.38,now);master.gain.setValueAtTime(.38,now+Math.max(0,4.8-offset));
  master.gain.linearRampToValueAtTime(0,now+Math.max(.01,5.2-offset));
  const tone=(frequency:number,start:number,duration:number,level:number,endFrequency=frequency)=>{
   if(start+duration<=offset)return;
   const skipped=Math.max(0,offset-start);
   frequency*=Math.pow(endFrequency/frequency,Math.min(1,skipped/(duration*.6)));
   level*=Math.pow(.0001/level,skipped/duration);duration-=skipped;
   const at=now+Math.max(0,start-offset),osc=track(ac.createOscillator()),gain=track(ac.createGain());
   osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(endFrequency,at+duration*.6);
   gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(level,at+Math.min(.035,duration/2));gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   osc.connect(gain);gain.connect(master);osc.start(at);osc.stop(at+duration);
  };
  tone(44,0,.76,.12,72);tone(135,.76,.94,.45,33);
  if(offset<=.76){
   const buffer=ac.createBuffer(1,Math.floor(ac.sampleRate*.7),ac.sampleRate),data=buffer.getChannelData(0);let seed=357;
   for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=((seed>>>0)/2147483648-1)*Math.pow(1-i/data.length,4);}
   const source=track(ac.createBufferSource()),filter=track(ac.createBiquadFilter()),gain=track(ac.createGain());
   source.buffer=buffer;filter.type='lowpass';filter.frequency.value=3800;gain.gain.value=.3;
   source.connect(filter);filter.connect(gain);gain.connect(master);source.start(now+.76-offset);
  }
  for(const [frequency,start,duration,level] of [[196,1.65,2.8,.24],[174.61,2.22,2.8,.22],[146.83,2.86,3.1,.24],[73.42,2.86,3.4,.16]]){
   for(const [ratio,amount] of [[1,1],[2,.28],[3,.1]])tone(frequency*ratio,start,duration,level*amount);
  }
  return true;
 }};
}
export function chessForfeitSound(id:string,elapsed:number,surface:Element|null){
 const userId=platformAudio.getSnapshot().userId;if(!userId)return()=>{};
 if(!isSoundSurfaceVisible(surface)){platformAudio.present({userId,id:'chess-forfeit:'+id});return()=>{};}
 const now=performance.now();
 return platformAudio.follow({userId,id:'chess-forfeit:'+id,startedAt:now-elapsed,
  expiresAt:now+CHESS_FORFEIT_SETTLEMENT_MS-elapsed,cueAt:forfeitCue});
}
