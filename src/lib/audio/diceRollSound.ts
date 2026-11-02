import {platformAudio} from './platformAudio';
import {approvedSound} from './approvedSounds';
import {isSoundSurfaceVisible} from './presentationSound';

/** Discrete admitted motion. The exact four-second samples cover the physical
 * 900ms roll and Quintzee's bounded 300–2500ms rumble. Owners stop the complete
 * graph at their visual boundary; muted/unloaded events never catch up. */
export function startDiceRollSound(identity: string | undefined, surface: Element | null) {
  if (!identity || !/^(yahtzee|horses|ship-captain-crew):/.test(identity)) return () => {};
  return startRollSound('cupRoll',identity,surface);
}
export function startRollSound(name:'cupRoll'|'quintzeeRoll',identity:string,surface:Element|null) {
  let stop = () => {};
  const {userId} = platformAudio.getSnapshot();
  if (!userId) return stop;
  platformAudio.present({userId, id: `palette:${name}:${identity}`,
    cue: isSoundSurfaceVisible(surface) ? approvedSound(name) : undefined},
    cancel => { stop = cancel; });
  return () => stop();
}
