/** Two strikes of the same metallic gong, with inharmonic overtones and a short decay. */
export function strikeBoxingBell(ctx: AudioContext): void {
  if (ctx.state !== 'running') return; // Never queue sound behind a mobile autoplay lock.
  for (const strike of [0, .32]) {
    const at = ctx.currentTime + strike;
    for (const [frequency, volume, decay] of [[740,.16,.65],[1191,.07,.45],[2035,.035,.25],[3093,.018,.14]]) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + .003);
      gain.gain.exponentialRampToValueAtTime(.0001, at + decay);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
      oscillator.start(at); oscillator.stop(at + decay);
    }
  }
}
