/**
 * 3-5-7 Wartime — Harness Readiness Gate.
 *
 * The ONLY permitted behavioral difference in this phase: the Instant
 * 3-5-7 harness cannot arm until this gate returns ready = true.
 *
 * Two distinct concepts:
 *   - WARTIME_IMPLEMENTATION_PHASE: reporting-only. How much of the
 *     wartime instrumentation has actually been wired in this build.
 *   - WARTIME_REQUIRED_REPRO_PHASE: gating. What the reproduction run
 *     REQUIRES the coverage manifest to satisfy before the harness may
 *     arm. This is always the FINAL required phase (3) so the gate
 *     stays closed for every non-final build.
 *
 * Ready requires:
 *   - a wartime session exists
 *   - the sink round-trip probe has passed
 *   - the coverage manifest is complete AT THE REQUIRED REPRO PHASE
 *   - no dropped events / sink failures / serialization failures
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
 * Reporting-only: reflects how much of the wartime instrumentation
 * has actually landed in this build. Bump this as each phase's
 * production hooks are wired. NEVER used to gate the harness.
 */
export const WARTIME_IMPLEMENTATION_PHASE: WartimePhase = 2;

/**
 * Gating: the coverage phase the harness reproduction REQUIRES.
 * Fixed at the final phase so the gate is closed on every build
 * that has not yet installed Phase 3 hooks.
 */
export const WARTIME_REQUIRED_REPRO_PHASE: WartimePhase = 3;

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
  implementationPhase: WartimePhase;
  requiredReproPhase: WartimePhase;
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
    payload: {
      implementationPhase: WARTIME_IMPLEMENTATION_PHASE,
      requiredReproPhase: WARTIME_REQUIRED_REPRO_PHASE,
    },
  });
  emitCoverageManifest();
  void runSinkRoundTripProbe(sessionId, BUILD_IDENTITY.buildSha).then((passed) => {
    if (passed) {
      markRequirementInstalled('integrity.round_trip', SRC.SINK_PROBE.id);
    }
    emitWartime({
      eventName: passed ? 'sink_probe_passed' : 'sink_probe_failed',
      sourceSiteId: SRC.SINK_PROBE.id,
      payload: { ...getSinkCounters() },
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
      implementationPhase: WARTIME_IMPLEMENTATION_PHASE,
      requiredReproPhase: WARTIME_REQUIRED_REPRO_PHASE,
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
  // GATE: always require the FINAL repro phase, never the implementation phase.
  if (!coverageComplete(WARTIME_REQUIRED_REPRO_PHASE)) reasons.push('coverage-incomplete');
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
    implementationPhase: WARTIME_IMPLEMENTATION_PHASE,
    requiredReproPhase: WARTIME_REQUIRED_REPRO_PHASE,
    coverage: coverageSummary(),
    sink: sinkCounters,
    sourceSiteCount: listSourceSites().length,
    currentMaxSequence: currentMaxSequence(),
  };
}

/**
 * Non-blocking readiness check. Emits a `not_ready` diagnostic
 * when refusing to arm. Returns true only when every gate is green.
 */
export function isWartimeReadyForHarness(context: Record<string, unknown> = {}): boolean {
  const snap = checkWartimeReady();
  if (!snap.ready) {
    emitWartime({
      eventName: 'not_ready',
      sourceSiteId: SRC.READINESS_GATE.id,
      payload: {
        reasons: snap.reasons,
        implementationPhase: snap.implementationPhase,
        requiredReproPhase: snap.requiredReproPhase,
        coverage: snap.coverage,
        sink: snap.sink,
        context,
      },
    });
  }
  return snap.ready;
}
