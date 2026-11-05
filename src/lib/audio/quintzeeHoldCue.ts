import type {AudioCue} from './audioManager';
import {platformAudio} from './platformAudio';
import {isSoundSurfaceVisible} from './presentationSound';

/** Quiet paired selection tones: rising hold, falling release, 85 ms each. */
export function quintzeeHoldCue(held:boolean):AudioCue{
 return {durationMs:85,policy:{priority:10,group:'quintzee-hold',intervalMs:0},schedule(ctx,destination,track){
  if(ctx.state!=='running')return false;
  const at=ctx.currentTime,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());
  osc.type='sine';osc.frequency.setValueAtTime(held?660:880,at);osc.frequency.exponentialRampToValueAtTime(held?880:660,at+.055);
  gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.025,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+.08);
  osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+.085);return true;
 }};
}
export function presentQuintzeeHold(userId:string,scope:string,held:boolean,surface:Element|null){
 if(!isSoundSurfaceVisible(surface))return;
 platformAudio.present({userId,id:`quintzee-hold:${scope}:${crypto.randomUUID()}`,cue:quintzeeHoldCue(held)});
}
