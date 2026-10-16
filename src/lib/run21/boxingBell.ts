import type { AudioCue, TrackAudioNode } from '@/lib/audio/audioManager';

/** Two strikes of the same metallic gong, with inharmonic overtones and a short decay. */
export function strikeBoxingBell(ctx: AudioContext, destination: AudioNode = ctx.destination, track: TrackAudioNode = node => node): boolean {
  if (ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  for (const strike of [0, .32]) {
    const at = now + strike;
    for (const [frequency, volume, decay] of [[740,.16,.65],[1191,.07,.45],[2035,.035,.25],[3093,.018,.14]]) {
      const oscillator = track(ctx.createOscillator()), gain = track(ctx.createGain());
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + .003);
      gain.gain.exponentialRampToValueAtTime(.0001, at + decay);
      oscillator.connect(gain); gain.connect(destination);
      oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
      oscillator.start(at); oscillator.stop(at + decay);
    }
  }
  return true;
}

export const boxingBellCue: AudioCue = { durationMs: 970, schedule: strikeBoxingBell };
