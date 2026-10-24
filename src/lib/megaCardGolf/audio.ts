import type {AudioCue} from '../audio/audioManager';
/** A short hollow cup impact and quieter settling bounce, not the completion chime. */
export const megaCupCue:AudioCue={durationMs:390,schedule(ctx,destination,track){
 [0,.11,.21].forEach((offset,i)=>{const at=ctx.currentTime+offset,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());osc.type='sine';osc.frequency.setValueAtTime(520-i*80,at);osc.frequency.exponentialRampToValueAtTime(130,at+.09);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.09/(i+1),at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+.12);osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+.13);});return true;
}};
/** Original, quiet mallet notes. The application audio manager owns preferences and cancellation. */
export const megaHoleCue:AudioCue={durationMs:650,schedule(ctx,destination,track){
 [523.25,659.25,783.99].forEach((frequency,i)=>{const at=ctx.currentTime+i*.13,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());osc.type='sine';osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.055,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+.3);osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+.32);});return true;
}};

/** Original driver swing: a short airy sweep, crisp impact, and metallic ring. */
export const megaTeeCue:AudioCue={durationMs:720,schedule(ctx,destination,track){
 const at=ctx.currentTime,noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.2),ctx.sampleRate),data=noise.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1);
 const source=track(ctx.createBufferSource()),filter=track(ctx.createBiquadFilter()),gain=track(ctx.createGain());
 source.buffer=noise;filter.type='highpass';filter.frequency.setValueAtTime(900,at);filter.frequency.exponentialRampToValueAtTime(4200,at+.18);
 gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.05,at+.14);gain.gain.exponentialRampToValueAtTime(.0001,at+.2);
 source.connect(filter);filter.connect(gain);gain.connect(destination);source.start(at);source.stop(at+.21);
 [1800,2780,4100].forEach((frequency,i)=>{const hit=at+.17,osc=track(ctx.createOscillator()),g=track(ctx.createGain());osc.type='sine';osc.frequency.setValueAtTime(frequency,hit);osc.frequency.exponentialRampToValueAtTime(frequency*.7,hit+.2);g.gain.setValueAtTime(.0001,hit);g.gain.exponentialRampToValueAtTime(.065/(i+1),hit+.002);g.gain.exponentialRampToValueAtTime(.0001,hit+.38);osc.connect(g);g.connect(destination);osc.start(hit);osc.stop(hit+.4);});return true;
}};
/** Original resolving mallet melody; no borrowed recording or game-state effects. */
export const megaFinalCue:AudioCue={durationMs:4200,schedule(ctx,destination,track){
 [523.25,659.25,783.99,1046.5,987.77,783.99,659.25,587.33,523.25].forEach((frequency,i)=>{
  const at=ctx.currentTime+i*.36,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());osc.type='sine';osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.055,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+(i===8?1.1:.55));osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+(i===8?1.15:.6));
 });return true;
}};
export const megaCue=(kind:'cup'|'hole'|'tee'|'final')=>({cup:megaCupCue,hole:megaHoleCue,tee:megaTeeCue,final:megaFinalCue})[kind];
