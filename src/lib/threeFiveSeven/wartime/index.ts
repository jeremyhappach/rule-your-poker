/**
 * 3-5-7 Wartime — public entry point.
 *
 * Importing this module bootstraps the session envelope, emits the
 * coverage manifest, and kicks the async sink round-trip probe. Safe
 * to import multiple times — bootstrap is idempotent.
 */

import { bootstrapWartime } from './readiness';

if (typeof window !== 'undefined') {
  void bootstrapWartime();
}

export { emitWartime } from './emit';
export {
  bootstrapWartime,
  checkWartimeReady,
  isWartimeReadyForHarness,
  emitCoverageManifest,
  WARTIME_IMPLEMENTATION_PHASE,
  WARTIME_REQUIRED_REPRO_PHASE,
} from './readiness';
export { getSinkCounters, isSinkRoundTripPassed } from './sink';
export { getWartimeSessionId, ensureWartimeSession, resetWartimeSession } from './session';
export { markRequirementInstalled, coverageSummary, listRequirements } from './coverage';
export { SRC, registerSourceSite, listSourceSites } from './sourceSites';
// Phase 2 wiring primitives (side-effect: registers Phase 2 sites).
import './phase2Wiring';
import './async';
import './db';
import './realtime';
export {
  useWartimeComponentInstance,
  useWartimeStateWrite,
  emitRefWrite,
  emitAuthoritativeSnapshot,
  emitSelfFaceUpChannel,
  emitOpponentCardBackChannel,
  useDealRedispatchDetector,
} from './phase2Wiring';
export { setWartimeTimeout, requestWartimeAnimationFrame, trackWartimePromise } from './async';
export { withWartimeMutation } from './db';
export { wrapWartimeRealtime } from './realtime';
