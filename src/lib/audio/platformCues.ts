import type { AudioCue } from './audioManager';

// Existing waveforms and timing, now using the shared context and cancellable output.
export const doorbellCue: AudioCue = {
  durationMs: 500,
  schedule(ctx, destination, track) {
    const now = ctx.currentTime;
    for (const [frequency, offset, volume, end] of [[880, 0, 0.3, 0.3], [659.25, 0.15, 0.25, 0.5]]) {
      const oscillator = track(ctx.createOscillator()), gain = track(ctx.createGain());
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(volume, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + end);
      oscillator.connect(gain); gain.connect(destination);
      oscillator.start(now + offset); oscillator.stop(now + end);
    }
    return true;
  },
};

export const knockCue: AudioCue = {
  durationMs: 420,
  schedule(ctx, destination, track) {
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.18;
      const bufferSize = ctx.sampleRate * 0.06;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let s = 0; s < bufferSize; s++) samples[s] = (Math.random() * 2 - 1) * 0.8;
      const noise = track(ctx.createBufferSource()); noise.buffer = buffer;
      const filter = track(ctx.createBiquadFilter()); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, t); filter.Q.setValueAtTime(1.5, t);
      const gain = track(ctx.createGain());
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.7, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      const sub = track(ctx.createOscillator()); sub.type = 'sine';
      sub.frequency.setValueAtTime(80, t);
      sub.frequency.exponentialRampToValueAtTime(40, t + 0.05);
      const subGain = track(ctx.createGain());
      subGain.gain.setValueAtTime(0, t);
      subGain.gain.linearRampToValueAtTime(0.5, t + 0.003);
      subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      noise.connect(filter); filter.connect(gain); gain.connect(destination);
      sub.connect(subGain); subGain.connect(destination);
      noise.start(t); noise.stop(t + 0.06); sub.start(t); sub.stop(t + 0.06);
    }
    return true;
  },
};

export const ginScratchCue: AudioCue = {
  durationMs: 400,
  schedule(ctx, destination, track) {
    const now = ctx.currentTime, duration = 0.4;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-(i / ctx.sampleRate) * 6) * 0.9;
    const source = track(ctx.createBufferSource()); source.buffer = buffer;
    source.playbackRate.setValueAtTime(2.5, now);
    source.playbackRate.exponentialRampToValueAtTime(0.4, now + duration);
    const filter = track(ctx.createBiquadFilter()); filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);
    filter.Q.setValueAtTime(3, now);
    const gain = track(ctx.createGain());
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(destination);
    source.start(now); source.stop(now + duration);
    return true;
  },
};
