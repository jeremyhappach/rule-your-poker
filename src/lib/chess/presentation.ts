/** One presentation timeline for CSS and audio; gameplay clocks are independent. */
export const chessMotion = {slide: 360, hop: 480, poof: 800, landing: .8} as const;
export const chessAudio = {twip: .16, lift: .12, airborneSlideAt: .15, airborneSlide: .11, crumbleEnd: .66} as const;
export type ChessSound = 'slide' | 'hop' | 'poof';

/** Short swept movement, tonal lift/wood landing, and separate granular dust. */
export function chessSamples(type: ChessSound, rate = 48000) {
 const seconds = chessMotion[type] / 1000, samples = new Float32Array(Math.round(rate * seconds));
 let seed = 73021, smooth = 0, bass = 0;
 const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296;};
 const grains = Array.from({length: 42}, (_, i) => ({at: .015 + i / 42 * .66, length: .025 + random() * .09, level: .15 + random() * .3}));
 // A defined swept front with a little air; no sustained friction bed.
 const twip=(t:number,duration:number,air:number)=>{
  if(t<0||t>=duration)return 0;
  const p=t/duration,envelope=Math.min(1,t/.006)*(1-p)**1.7;
  const phase=2*Math.PI*duration*(1700*p-600*p*p);
  return envelope*(.72*Math.sin(phase)+.16*Math.sin(phase*1.6)+.12*air);
 };
 for (let i = 0; i < samples.length; i++) {
  const t = i / rate;
  smooth += .42 * (random() * 2 - 1 - smooth);
  bass += .065 * (smooth - bass);
  const texture = smooth - bass;
  let value = 0;
  if (type === 'slide') {
   value=twip(t,chessAudio.twip,texture);
  } else if (type === 'hop') {
   // Quiet rounded lift, a small mid-hop twip, then a lower wooden landing.
   if(t<chessAudio.lift){
    const p=t/chessAudio.lift,envelope=Math.sin(Math.PI*p)**1.5;
    value=.32*envelope*Math.sin(2*Math.PI*(420*t+1800*t*t));
   }
   value+=.26*twip(t-chessAudio.airborneSlideAt,chessAudio.airborneSlide,texture);
   const land=t-seconds*chessMotion.landing;
   if(land>=0){
    const envelope=Math.min(1,land/.004)*Math.exp(-land*44)*Math.min(1,(seconds-t)/.016);
    const phase=2*Math.PI*(210*land-210*land*land);
    value+=envelope*(.62*Math.sin(phase)+.2*Math.sin(phase*2)+.08*Math.sin(phase*3)+.09*texture);
   }
  } else {
   let crumble = .16;
   for (const grain of grains) {
    const at = (t - grain.at) / grain.length;
    if (at > 0 && at < 1) crumble += grain.level * Math.sin(Math.PI * at) ** 2;
   }
   // Dust keeps drifting visually; its last 140 ms settle quietly.
   const envelope = Math.min(1,t/.028)*Math.max(0,Math.min(1,(chessAudio.crumbleEnd-t)/.18));
   value = texture * crumble * envelope;
  }
  samples[i] = value;
 }
 const peak = samples.reduce((m, n) => Math.max(m, Math.abs(n)), 0);
 const level = type === 'poof' ? .18 : type === 'hop' ? .06 : .1;
 for (let i = 0; i < samples.length; i++) samples[i] *= level / peak;
 return {samples, rate};
}
