/**
 * 3-5-7 Wartime — Harness Readiness Gate.
 *
 * The ONLY permitted behavioral difference in this phase: the Instant
 * 3-5-7 harness cannot arm until this gate returns ready = true.
 *
 * Ready requires:
 *   - a wartime session exists
 *   - the sink round-trip probe has passed
 *   - the coverage manifest for the current active phase is complete
 *
 * Phase 1 lands the plumbing but leaves phase 2/3 requirements
 * uninstalled — so the gate correctly refuses to arm even though the
 * code compiles. Later phases flip requirements on as their hooks land.
 */

import { BUILD_IDENTITY } from '@/lib/buildIdentity';
import {
  coverageComplete,
  coverageSummary,
  listRequirements,
  markRequirementInstalled,
  type WartimePhase,
} from './coverage';
import { emitWartime } from './emit';
import {
  ensureWartimeSession,
  getWartimeSessionId,
  currentMaxSequence,
} from './session';
import {
  getSinkCounters,
  isSinkRoundTripPassed,
  runSinkRoundTripProbe,
} from './sink';
import { SRC, listSourceSites } from './sourceSites';

/**
 * Active phase target for the readiness gate. Bumped as later
 * instrumentation phases land. Kept at 1 until phase 2 goes in.
 */
export const WARTIME_ACTIVE_PHASE: WartimePhase = 1;

let coverageEmittedForSession: string | null = null;
let bootstrapKicked = false;

// Phase 1 requirements are installed by their own owners at import time
// so the manifest reports honest coverage from the first emit onward.
markRequirementInstalled('session.envelope', SRC.SESSION_START.id);
markRequirementInstalled('coverage.manifest', SRC.COVERAGE_REPORT.id);
markRequirementInstalled('integrity.flush', SRC.SINK_FLUSH.id);
markRequirementInstalled('harness.readiness_gate', SRC.READINESS_GATE.id);
markRequirementInstalled('harness.readiness_gate', SRC.HARNESS_GATED.id);

export interface WartimeReadinessSnapshot {
  ready: boolean;
  reasons: string[];
  sessionId: string | null;
  buildSha: string;
  bundleFilename: string | null;
  activePhase: WartimePhase;
  coverage: ReturnType<typeof coverageSummary>;
  sink: ReturnType<typeof getSinkCounters>;
  sourceSiteCount: number;
  currentMaxSequence: number;
}

export async function bootstrapWartime(): Promise<void> {
  if (bootstrapKicked) return;
  bootstrapKicked = true;
  const sessionId = ensureWartimeSession();
  emitWartime({
    eventName: 'session_start',
    sourceSiteId: SRC.SESSION_START.id,
    payload: { activePhase: WARTIME_ACTIVE_PHASE },
  });
  emitCoverageManifest();
  // Non-blocking sink round-trip probe.
  void runSinkRoundTripProbe(sessionId, BUILD_IDENTITY.buildSha).then((passed) => {
    if (passed) {
      markRequirementInstalled('integrity.round_trip', SRC.SINK_PROBE.id);
    }
    emitWartime({
      eventName: passed ? 'sink_probe_passed' : 'sink_probe_failed',
      sourceSiteId: SRC.SINK_PROBE.id,
      payload: getSinkCounters(),
    });
  });
}

export function emitCoverageManifest(): void {
  const sessionId = getWartimeSessionId();
  if (!sessionId || coverageEmittedForSession === sessionId) return;
  coverageEmittedForSession = sessionId;
  const requirements = listRequirements();
  emitWartime({
    eventName: 'coverage_manifest',
    sourceSiteId: SRC.COVERAGE_REPORT.id,
    payload: {
      activePhase: WARTIME_ACTIVE_PHASE,
      requirements: requirements.map((r) => ({
        requirementId: r.requirementId,
        description: r.description,
        phase: r.phase,
        expectedSourceSiteIds: r.expectedSourceSiteIds,
        installed: r.installed,
        installedBySourceSiteIds: r.installedBySourceSiteIds,
      })),
      sourceSites: listSourceSites(),
      summary: coverageSummary(),
    },
  });
}

export function checkWartimeReady(): WartimeReadinessSnapshot {
  const reasons: string[] = [];
  const sessionId = getWartimeSessionId();
  if (!sessionId) reasons.push('no-session');
  if (!isSinkRoundTripPassed()) reasons.push('sink-round-trip-not-passed');
  if (!coverageComplete(WARTIME_ACTIVE_PHASE)) reasons.push('coverage-incomplete');
  const sinkCounters = getSinkCounters();
  if (sinkCounters.droppedEventCount > 0) reasons.push('dropped-events');
  if (sinkCounters.sinkFailureCount > 0) reasons.push('sink-failures');
  if (sinkCounters.serializationFailureCount > 0) reasons.push('serialization-failures');

  const ready = reasons.length === 0;
  return {
    ready,
    reasons,
    sessionId,
    buildSha: BUILD_IDENTITY.buildSha,
    bundleFilename: BUILD_IDENTITY.bundleFilename || null,
    activePhase: WARTIME_ACTIVE_PHASE,
    coverage: coverageSummary(),
    sink: sinkCounters,
    sourceSiteCount: listSourceSites().length,
    currentMaxSequence: currentMaxSequence(),
  };
}

/**
 * Non-blocking readiness check for gameplay callers. Emits a
 * `not_ready` diagnostic when refusing to arm. Returns true only
 * when every gate is green.
 */
export function isWartimeReadyForHarness(context: Record<string, unknown> = {}): boolean {
  const snap = checkWartimeReady();
  if (!snap.ready) {
    emitWartime({
      eventName: 'not_ready',
      sourceSiteId: SRC.READINESS_GATE.id,
      payload: { reasons: snap.reasons, coverage: snap.coverage, sink: snap.sink, context },
    });
  }
  return snap.ready;
}
