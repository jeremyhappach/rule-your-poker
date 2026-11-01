import type {AudioCue, TrackAudioNode} from './audioManager';

interface Brush {
  offset: number; duration: number; attack: number;
  startHz: number; endHz: number; peak: number; seed: number;
}

function brush(context: AudioContext, destination: AudioNode, track: TrackAudioNode,
  {offset, duration, attack, startHz, endHz, peak, seed}: Brush) {
  const time = context.currentTime + offset;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    samples[i] = (seed >>> 0) / 2147483648 - 1;
  }
  const source = track(context.createBufferSource());
  const filter = track(context.createBiquadFilter());
  const gain = track(context.createGain());
  source.buffer = buffer;
  filter.type = 'bandpass'; filter.Q.value = 0.48;
  filter.frequency.setValueAtTime(startHz, time);
  filter.frequency.exponentialRampToValueAtTime(endHz, time + duration);
  // Rounded edges keep these brief movements free of the old percussive snap.
  const envelope = new Float32Array(257);
  for (let i = 0; i < envelope.length; i++) {
    const at = duration * i / (envelope.length - 1);
    envelope[i] = at < attack
      ? peak * (0.5 - 0.5 * Math.cos(Math.PI * at / attack))
      : peak * (0.5 + 0.5 * Math.cos(Math.PI * (at - attack) / (duration - attack)));
  }
  gain.gain.setValueCurveAtTime(envelope, time, duration);
  source.connect(filter); filter.connect(gain); gain.connect(destination);
  source.start(time); source.stop(time + duration);
}

/** Approved Run21/TriTowers auditions: one descending brush for play. */
export const cardPlayCue: AudioCue = {
  durationMs: 150,
  schedule(context, destination, track) {
    brush(context, destination, track, {offset: 0, duration: 0.15, attack: 0.042,
      startHz: 2100, endHz: 750, peak: 0.09, seed: 1831565813});
    return true;
  },
};

/** Two lighter ascending brushes distinguish pass/draw from card placement. */
export const cardPassCue: AudioCue = {
  durationMs: 130,
  schedule(context, destination, track) {
    brush(context, destination, track, {offset: 0, duration: 0.06, attack: 0.023,
      startHz: 1700, endHz: 3300, peak: 0.078, seed: 918273645});
    brush(context, destination, track, {offset: 0.068, duration: 0.062, attack: 0.024,
      startHz: 2200, endHz: 3800, peak: 0.072, seed: 713865291});
    return true;
  },
};
