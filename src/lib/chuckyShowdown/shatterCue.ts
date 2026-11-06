import type {AudioCue} from '@/lib/audio/audioManager';

/** The short explosion at the end of the heart flight shares the game's audio output and mute policy. */
export const chuckyShatterCue: AudioCue = {
  durationMs: 230,
  schedule(context, destination, track) {
    const now = context.currentTime;
    const thump = track(context.createOscillator());
    const body = track(context.createGain());
    thump.frequency.setValueAtTime(205, now);
    thump.frequency.exponentialRampToValueAtTime(75, now + .155);
    body.gain.setValueAtTime(.00085, now);
    body.gain.exponentialRampToValueAtTime(.17, now + .008);
    body.gain.exponentialRampToValueAtTime(.00085, now + .19);
    thump.connect(body).connect(destination);
    thump.start(now);
    thump.stop(now + .20);

    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .185), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 637;
    for (let i = 0; i < samples.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }
    const noise = track(context.createBufferSource());
    const filter = track(context.createBiquadFilter());
    const air = track(context.createGain());
    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.Q.value = .7;
    filter.frequency.setValueAtTime(2500, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + .16);
    air.gain.setValueAtTime(.00085, now);
    air.gain.exponentialRampToValueAtTime(.136, now + .004);
    air.gain.exponentialRampToValueAtTime(.00085, now + .175);
    noise.connect(filter).connect(air).connect(destination);
    noise.start(now);
    noise.stop(now + .185);
    return true;
  },
};
