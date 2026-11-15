import {approvedSound, cribbagePointsCue} from '@/lib/audio/approvedSounds';
import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {run21FailureCueAt, RUN21_FAILURE_CUE_MS} from '@/lib/run21/failureCue';
import type {AudioCue} from '@/lib/audio/audioManager';

/** A short falling tone identifies a declaration, never a scored point. */
export const cribbageGoCue: AudioCue = {
  durationMs: 200, policy: {priority: 45, group: 'cribbage-go', intervalMs: 0},
  schedule(context, destination, track) {
    const start = context.currentTime, end = start + .2;
    const oscillator = track(context.createOscillator()), gain = track(context.createGain());
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, start);
    oscillator.frequency.exponentialRampToValueAtTime(280, end);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.14, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, end - .005);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain); gain.connect(destination);
    oscillator.start(start); oscillator.stop(end);
    return true;
  },
};

export function presentCribbageGo(identity: string, surface: Element | null) {
  const {userId} = platformAudio.getSnapshot();
  if (!userId) return;
  platformAudio.present({userId, id: 'cribbage-go:' + identity,
    cue: isSoundSurfaceVisible(surface) ? cribbageGoCue : undefined});
}

/** Includes the final sample's tail, even when audio is muted or not loaded. */
export function cribbageScoreDurationMs(points: number) {
  return points === 0 ? RUN21_FAILURE_CUE_MS
    : cribbagePointsCue(points)?.durationMs ?? Math.max(0, points - 1) * 90 + 120;
}

/** Presentation only: the caller supplies the already displayed award. */
export function presentCribbageScore(points: number, identity: string, surface: Element | null) {
  const {userId} = platformAudio.getSnapshot();
  if (!userId) return;
  platformAudio.present({userId, id: 'cribbage-score:' + identity,
    cue: isSoundSurfaceVisible(surface)
      ? points === 0 ? run21FailureCueAt(0, RUN21_FAILURE_CUE_MS) : cribbagePointsCue(points)
      : undefined});
}

/** These legacy flights bypass deal transport. Share award priority so a
 * scoring card can slide and score without either sound suppressing the other. */
export function cribbageSlideSoundRef(identity: string, enabled: boolean) {
  return (node: HTMLDivElement | null) => {
    if (!node) return;
    node.ontransitionrun = event => {
      if (!enabled || event.target !== node || !['left', 'top', 'transform'].includes(event.propertyName)) return;
      const {userId} = platformAudio.getSnapshot(), cue = approvedSound('slide');
      if (!userId) return;
      platformAudio.present({userId, id: 'cribbage-slide:' + identity,
        cue: cue && isSoundSurfaceVisible(node)
          ? {...cue, policy: {priority: 45, group: 'cribbage-slide', intervalMs: 0}} : undefined});
    };
  };
}
