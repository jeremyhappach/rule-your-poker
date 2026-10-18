import type {AudioCue} from '@/lib/audio/audioManager';
export const elevenGroupDing:AudioCue={durationMs:90,schedule(ctx,destination,track){
 const gain=track(ctx.createGain()),tone=track(ctx.createOscillator()),at=ctx.currentTime;
 tone.type='sine';tone.frequency.setValueAtTime(1320,at);gain.gain.setValueAtTime(.055,at);gain.gain.exponentialRampToValueAtTime(.001,at+.085);
 tone.connect(gain);gain.connect(destination);tone.start(at);tone.stop(at+.09);return true;
}};
