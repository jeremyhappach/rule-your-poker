import type {AudioCue} from '../audio/audioManager';
/** Original, quiet mallet notes. The application audio manager owns preferences and cancellation. */
export const megaHoleCue:AudioCue={durationMs:650,schedule(ctx,destination,track){
 [523.25,659.25,783.99].forEach((frequency,i)=>{const at=ctx.currentTime+i*.13,osc=track(ctx.createOscillator()),gain=track(ctx.createGain());osc.type='sine';osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.055,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+.3);osc.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+.32);});return true;
}};
