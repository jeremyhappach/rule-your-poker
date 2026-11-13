/** One presentation timeline for CSS and audio; gameplay clocks are independent. */
export const chessMotion = {slide: 360, hop: 480, poof: 800, landing: .8} as const;
export type ChessSound = 'slide' | 'hop' | 'poof';

/** Stable, softly band-limited friction/grains. No low-frequency impact transient. */
export function chessSamples(type: ChessSound, rate = 48000) {
 const seconds = chessMotion[type] / 1000, samples = new Float32Array(Math.round(rate * seconds));
 let seed = 73021, smooth = 0, bass = 0;
 const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296;};
 const grains = Array.from({length: 42}, (_, i) => ({at: .015 + i / 42 * .66, length: .025 + random() * .09, level: .15 + random() * .3}));
 for (let i = 0; i < samples.length; i++) {
  const t = i / rate, p = t / seconds;
  smooth += .42 * (random() * 2 - 1 - smooth);
  bass += .065 * (smooth - bass);
  const texture = smooth - bass;
  let value = 0;
  if (type === 'slide') {
   // Friction follows travel: quick soft attack, sustained middle, gentle stop.
   const envelope = Math.min(1, t / .018) * Math.min(1, (seconds - t) / .055);
   value = texture * envelope * (.72 + .18 * Math.sin(Math.PI * p)) * (1 + .12 * Math.sin(t * 190));
  } else if (type === 'hop') {
   const lift = t < .22 ? Math.sin(Math.PI * t / .22) ** .7 : 0;
   const landAt = seconds * chessMotion.landing, land = t - landAt;
   const landing = land >= 0 ? Math.min(1, land / .006) * Math.exp(-land * 38) * Math.min(1, (seconds - t) / .018) : 0;
   value = texture * (lift * .65 + landing * .85);
   // A small wood resonance gives phone speakers an audible, soft landing.
   value += landing * .24 * Math.sin(2 * Math.PI * (620 * land - 550 * land * land));
  } else {
   let crumble = .16;
   for (const grain of grains) {
    const at = (t - grain.at) / grain.length;
    if (at > 0 && at < 1) crumble += grain.level * Math.sin(Math.PI * at) ** 2;
   }
   const envelope = Math.min(1, t / .028) * Math.min(1, (seconds - t) / .2);
   value = texture * crumble * envelope;
  }
  samples[i] = value;
 }
 const peak = samples.reduce((m, n) => Math.max(m, Math.abs(n)), 0);
 const level = type === 'poof' ? .18 : type === 'hop' ? .14 : .1;
 for (let i = 0; i < samples.length; i++) samples[i] *= level / peak;
 return {samples, rate};
}
