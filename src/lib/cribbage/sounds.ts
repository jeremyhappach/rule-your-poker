import {approvedSound, cribbagePointsCue} from '@/lib/audio/approvedSounds';
import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {run21FailureCueAt, RUN21_FAILURE_CUE_MS} from '@/lib/run21/failureCue';

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
