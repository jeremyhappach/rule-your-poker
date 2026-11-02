import type {AudioCue} from './audioManager';
import {decodePCM, pcmCue} from './pcm';
import slide from '@/assets/audio/deal-paper.wav?url';
import flip from '@/assets/audio/flip-soft.wav?url';
import diceMany from '@/assets/audio/dice-land.wav?url';
import diceOne from '@/assets/audio/dice-land-soft.wav?url';
import peg from '@/assets/audio/peg-wood.wav?url';
import cracked from '@/assets/audio/holm-glass-recorded.wav?url';
import winner from '@/assets/audio/winner-a.wav?url';

const files = {slide, flip, diceMany, diceOne, peg, cracked, winner};
export type ApprovedSound = keyof typeof files | 'cribbageHighlight';
const cues = new Map<ApprovedSound, AudioCue>();
let loading: Promise<void> | undefined;
const policies = {
  slide: {priority: 10, group: 'cards', intervalMs: 160},
  flip: {priority: 20, group: 'cards', intervalMs: 90},
  diceMany: {priority: 40, group: 'dice', intervalMs: 80},
  diceOne: {priority: 40, group: 'dice', intervalMs: 80},
  peg: {priority: 45, group: 'pegs', intervalMs: 80},
  cracked: {priority: 90, group: 'outcome', intervalMs: 0},
  winner: {priority: 100, group: 'outcome', intervalMs: 0},
};

/** Fetch once without creating an AudioContext or touching the user's preference.
 * Vite fingerprints the exact auditioned bytes for browser/PWA caching. A missed
 * preload stays silent; fetching must never delay or replay a visual event. */
export function preloadApprovedSounds() {
  return loading ??= Promise.all(Object.entries(files).map(async ([name, url]) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const cue = pcmCue(decodePCM(await response.arrayBuffer()));
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
export function approvedSound(name: ApprovedSound) {
  return name === 'cribbageHighlight' ? cribbageHighlightCue : cues.get(name);
}
export function diceLandingSound(indices: readonly number[], diceCount: number): ApprovedSound | null {
  const count = new Set(indices.filter(i => Number.isInteger(i) && i >= 0 && i < diceCount)).size;
  return count === 0 ? null : count === 1 ? 'diceOne' : 'diceMany';
}
