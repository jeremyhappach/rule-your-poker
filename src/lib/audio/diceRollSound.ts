import {platformAudio} from './platformAudio';
import {approvedSound} from './approvedSounds';
import {isSoundSurfaceVisible} from './presentationSound';

/** A discrete admitted visual roll, never a queued/catch-up timeline.
 * Cup C is approved for Yahtzee only. The exact 4-second recording covers its
 * 900ms animation; the renderer stops the complete graph on its landing frame. */
export function startDiceRollSound(identity: string | undefined, surface: Element | null) {
  let stop = () => {};
  const {userId} = platformAudio.getSnapshot();
  if (!userId || !identity?.startsWith('yahtzee:')) return stop;
  platformAudio.present({userId, id: `palette:cupRoll:${identity}`,
    cue: isSoundSurfaceVisible(surface) ? approvedSound('cupRoll') : undefined},
    cancel => { stop = cancel; });
  return () => stop();
}
