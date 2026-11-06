import type {AudioCue} from './audioManager';
import {decodePCM, pcmCue} from './pcm';
import slide from '@/assets/audio/deal-paper.wav?url';
import flip from '@/assets/audio/flip-soft.wav?url';
import diceMany from '@/assets/audio/dice-land.wav?url';
import diceOne from '@/assets/audio/dice-land-soft.wav?url';
import peg from '@/assets/audio/peg-wood.wav?url';
import cracked from '@/assets/audio/holm-glass-recorded.wav?url';
import winner from '@/assets/audio/winner-a.wav?url';
import noQualify from '@/assets/audio/no-qualify-a.wav?url';
import midnight from '@/assets/audio/midnight-a.wav?url';
import fiveOnes from '@/assets/audio/five-ones-a.wav?url';
import scorePost from '@/assets/audio/score-post-a.wav?url';
import yahtzee from '@/assets/audio/yahtzee-a.wav?url';
import myLeg from '@/assets/audio/my-leg-a.wav?url';
import opponentLeg from '@/assets/audio/opponent-leg-a.wav?url';
import sweep from '@/assets/audio/sweep-a.wav?url';
import cupRoll from '@/assets/audio/cup-roll-c.wav?url';
import quintzeeRoll from '@/assets/audio/quintzee-roll-b2.wav?url';
import dropCountdown from '@/assets/audio/drop-countdown-beeps.wav?url';
import chucky from '@/assets/audio/chucky-heartbeat.wav?url';
import farkleBust from '@/assets/audio/farkle-bust-a.wav?url';
import upperBonus from '@/assets/audio/upper-bonus-b.wav?url';
import allFilled from '@/assets/audio/all-filled-b.wav?url';
import chip from '@/assets/audio/chip-single.wav?url';
import triInvalid from '@/assets/audio/tritowers-invalid-b.wav?url';
import run21Bust from '@/assets/audio/run21-bust-b.wav?url';

const files = {slide, flip, diceMany, diceOne, peg, cracked, winner, noQualify, midnight, fiveOnes, scorePost, yahtzee, myLeg, opponentLeg, sweep, cupRoll, quintzeeRoll, dropCountdown, chucky, farkleBust, upperBonus, allFilled, chip, triInvalid, run21Bust};
export type ApprovedSound = keyof typeof files | 'cribbageHighlight' | 'riffle';
const cues = new Map<ApprovedSound, AudioCue>();
const countdown = new Map<string, AudioCue>();
let loading: Promise<void> | undefined;
const policies = {
  slide: {priority: 10, group: 'cards', intervalMs: 160},
  flip: {priority: 20, group: 'cards', intervalMs: 90},
  diceMany: {priority: 40, group: 'dice', intervalMs: 80},
  diceOne: {priority: 40, group: 'dice', intervalMs: 80},
  peg: {priority: 45, group: 'pegs', intervalMs: 80},
  cracked: {priority: 90, group: 'outcome', intervalMs: 0},
  winner: {priority: 100, group: 'outcome', intervalMs: 0},
  noQualify: {priority: 65, group: 'scoring', intervalMs: 0},
  midnight: {priority: 85, group: 'scoring', intervalMs: 0},
  fiveOnes: {priority: 85, group: 'scoring', intervalMs: 0},
  scorePost: {priority: 55, group: 'scoring', intervalMs: 0},
  yahtzee: {priority: 85, group: 'scoring', intervalMs: 0},
  myLeg: {priority: 75, group: 'outcome', intervalMs: 0},
  opponentLeg: {priority: 70, group: 'outcome', intervalMs: 0},
  sweep: {priority: 110, group: 'outcome', intervalMs: 0},
  cupRoll: {priority: 25, group: 'rolling', intervalMs: 0},
  quintzeeRoll: {priority: 25, group: 'rolling', intervalMs: 0},
  dropCountdown: {priority: 35, group: 'countdown', intervalMs: 0},
  chucky: {priority: 60, group: 'chucky', intervalMs: 0},
  farkleBust: {priority: 70, group: 'scoring', intervalMs: 0},
  upperBonus: {priority: 75, group: 'scoring', intervalMs: 0},
  allFilled: {priority: 75, group: 'scoring', intervalMs: 0},
  chip: {priority: 15, group: 'chips', intervalMs: 160},
  triInvalid: {priority: 30, group: 'invalid-play', intervalMs: 100},
  run21Bust: {priority: 70, group: 'failure', intervalMs: 0},
};

/** Fetch once without creating an AudioContext or touching the user's preference.
 * Vite fingerprints the exact auditioned bytes for browser/PWA caching. A missed
 * preload stays silent; fetching must never delay or replay a visual event. */
export function preloadApprovedSounds() {
  return loading ??= Promise.all(Object.entries(files).map(async ([name, url]) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const pcm = decodePCM(await response.arrayBuffer());
      if(name==='slide')paperRecording=pcm;
      const cue = name==='chucky'?pcmCue(pcm,0,400):pcmCue(pcm);
      if (name === 'dropCountdown') ['3','2','1'].forEach((beat,i) =>
        countdown.set(beat, {...pcmCue(pcm,i*900,180),policy:policies.dropCountdown}));
      cues.set(name as keyof typeof files, {...cue, policy: policies[name as keyof typeof files]});
    } catch { /* Audio availability cannot affect gameplay. */ }
  })).then(() => {});
}

// A quiet wooden/mallet dyad, distinct from Golf's bright three-note hole cue.
// One envelope per highlighted combination; pitch never follows the total score.
export const cribbageHighlightCue: AudioCue = {
  durationMs: 190,
  policy: {priority: 60, group: 'scoring', intervalMs: 0},
  schedule(ctx, destination, track) {
    for (const [frequency, delay, level] of [[659.25, 0, .038], [987.77, .022, .024]]) {
      const oscillator = track(ctx.createOscillator());
      const gain = track(ctx.createGain());
      const start = ctx.currentTime + delay;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
      oscillator.connect(gain); gain.connect(destination);
      oscillator.start(start); oscillator.stop(start + .165);
    }
    return true;
  },
};
// Keep the source so the solo shuffle can reuse the approved paper recording on demand.
let paperRecording: ReturnType<typeof decodePCM> | undefined;
function riffleSound(pcm:ReturnType<typeof decodePCM>):AudioCue{
  const samples=new Float32Array(Math.ceil(pcm.rate*.72));
  for(let card=0;card<18;card++){
    const start=Math.floor(pcm.rate*(.045+card*.024+card*card*.00055));
    // The audible snap in deal-paper.wav peaks at 106 ms.
    const cut=Math.floor(pcm.rate*(.081+(card%3)*.004));
    const length=Math.min(Math.floor(pcm.rate*.043),pcm.samples.length-cut,samples.length-start);
    for(let i=0;i<length;i++)samples[start+i]+=pcm.samples[cut+i]*Math.sin(Math.PI*i/length)*1.25;
  }
  return {...pcmCue({samples,rate:pcm.rate}),policy:{priority:25,group:'shuffle',intervalMs:0}};
}
export function approvedSound(name: ApprovedSound) {
  if(name==='riffle'&&!cues.has(name)&&paperRecording)cues.set(name,riffleSound(paperRecording));
  return name === 'cribbageHighlight' ? cribbageHighlightCue : cues.get(name);
}
/** Exact selected recording, sliced at its three approved tone onsets. */
export function approvedCountdownBeat(beat:string) { return countdown.get(beat); }
export function diceLandingSound(indices: readonly number[], diceCount: number): ApprovedSound | null {
  const count = new Set(indices.filter(i => Number.isInteger(i) && i >= 0 && i < diceCount)).size;
  return count === 0 ? null : count === 1 ? 'diceOne' : 'diceMany';
}
