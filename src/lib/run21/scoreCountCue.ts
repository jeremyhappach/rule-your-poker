import type {AudioCue} from '../audio/audioManager';

/** A short bright pulse follows each visible increase, at a bounded 20 Hz cadence. */
export function scoreCountCue(from:number,to:number,elapsed:number,remaining:number):AudioCue {
  const duration=elapsed+remaining;
  return {durationMs:Math.max(0,remaining-5),schedule(ctx,destination,track){
    let previous=Math.round(from+(to-from)*elapsed/duration);
    for(let at=Math.ceil(elapsed/50)*50;at<duration-30;at+=50){
      const score=Math.round(from+(to-from)*at/duration);
      if(score<=previous)continue;
      previous=score;
      const time=ctx.currentTime+(at-elapsed)/1000;
      const oscillator=track(ctx.createOscillator()),gain=track(ctx.createGain());
      oscillator.type='square';
      oscillator.frequency.setValueAtTime(660+440*at/duration,time);
      gain.gain.setValueAtTime(0,time);
      gain.gain.linearRampToValueAtTime(.025,time+.003);
      gain.gain.exponentialRampToValueAtTime(.001,time+.025);
      oscillator.connect(gain);gain.connect(destination);
      oscillator.start(time);oscillator.stop(time+.03);
    }
    return true;
  }};
}
