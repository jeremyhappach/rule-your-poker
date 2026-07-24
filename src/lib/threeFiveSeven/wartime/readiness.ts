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
  markHelperImplemented,
  registerActualEmitterInvocation,
  registerWartimeProductionHook,
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
import { SRC, listSourceSites, getSourceSite } from './sourceSites';

/**
 * Reporting-only: reflects how much of the wartime instrumentation
 * has actually landed in this build. Bump this as each phase's
 * production hooks are wired. NEVER used to gate the harness.
 */
export const WARTIME_IMPLEMENTATION_PHASE: WartimePhase = 3;

/**
 * Gating: the coverage phase the harness reproduction REQUIRES.
 * Fixed at the final phase so the gate is closed on every build
 * that has not yet installed Phase 3 hooks.
 */
export const WARTIME_REQUIRED_REPRO_PHASE: WartimePhase = 3;

let coverageEmittedForSession: string | null = null;
let bootstrapKicked = false;

// ── Batch 2: Phase 1 production-hook installation ─────────────
// Replaces the legacy `markRequirementInstalled` shim. Every Phase 1
// requirement now advertises a truthful production owner (file + fn
// from the source-site registry) and every mandatory Phase 1 site is
// marked installed at module import time. This is the design-time
// assertion that the emitter is wired at that exact source location;
// the actual runtime emit still originates from its owning function.
function installPhase1Site(requirementId: string, siteId: string): void {
  const site = getSourceSite(siteId);
  if (!site) return;
  markHelperImplemented(requirementId, siteId);
  registerWartimeProductionHook({
    requirementId,
    sourceSiteId: siteId,
    sourceFile: site.file,
    sourceFunction: site.fn,
  });
  registerActualEmitterInvocation(requirementId, siteId);
}

installPhase1Site('session.envelope',       SRC.SESSION_START.id);
installPhase1Site('coverage.manifest',      SRC.COVERAGE_REPORT.id);
installPhase1Site('integrity.flush',        SRC.SINK_FLUSH.id);
installPhase1Site('integrity.round_trip',   SRC.SINK_PROBE.id);
installPhase1Site('harness.readiness_gate', SRC.READINESS_GATE.id);
installPhase1Site('harness.readiness_gate', SRC.HARNESS_GATED.id);

// ── Batch 3: Phase 2 production-hook installation ─────────────
// Register the truthful production owner (file + fn from the source-
// site registry) and mark every mandatory Phase 2 invocation site
// installed. The runtime emit still originates from the owning
// component/module (see MobileGameTable, Game, ThreeFiveSevenDeal
// Orchestrator, PotToPlayerAnimation, and the wartime helper modules
// for async/db/realtime ownership). Phase 2 requirements that share
// a site with another requirement (e.g. MGT_MOUNT satisfying both
// component.mount and component.render_branch; DEAL_ORCH_MOUNT
// satisfying component.mount + deal.self_face_up + deal.opponent_
// card_back) are installed against each requirement explicitly.
const installPhase2Site = installPhase1Site;

// component.mount — every 3-5-7 owner mount
installPhase2Site('component.mount', SRC.MGT_MOUNT.id);
installPhase2Site('component.mount', SRC.GAME_MOUNT.id);
installPhase2Site('component.mount', SRC.DEAL_ORCH_MOUNT.id);
installPhase2Site('component.mount', SRC.POT_ANIM_MOUNT.id);
// component.render_branch — MGT branch emitter
installPhase2Site('component.render_branch', SRC.MGT_MOUNT.id);
// State / ref write sites
installPhase2Site('state.write.win_phase',            SRC.STATE_WIN_PHASE.id);
installPhase2Site('state.write.sweep_flags',          SRC.STATE_SWEEP_FLAGS.id);
installPhase2Site('state.write.sweep_awaiting',       SRC.STATE_SWEEP_AWAITING.id);
installPhase2Site('state.write.win_animation_active', SRC.STATE_WIN_ANIM_ACTIVE.id);
installPhase2Site('state.write.show_cards',           SRC.STATE_SHOW_CARDS.id);
installPhase2Site('state.write.show_cards',           SRC.STATE_SHOW_CARDS_GAME.id);
installPhase2Site('state.write.deal_runtime',         SRC.STATE_DEAL_RUNTIME.id);
// Ownership-substrate preflight sites
installPhase2Site('async.owner_registry', SRC.ASYNC_REGISTRY.id);
installPhase2Site('db.mutation_causality', SRC.DB_MUTATION.id);
installPhase2Site('realtime.owner',        SRC.REALTIME_OWNER.id);
// Authoritative snapshot
installPhase2Site('authoritative.snapshot', SRC.AUTH_SNAPSHOT.id);
// Deal transport channels — orchestrator mount + channel emitter
installPhase2Site('deal.self_face_up',        SRC.DEAL_ORCH_MOUNT.id);
installPhase2Site('deal.self_face_up',        SRC.DEAL_SELF_FACE_UP.id);
installPhase2Site('deal.opponent_card_back',  SRC.DEAL_ORCH_MOUNT.id);
installPhase2Site('deal.opponent_card_back',  SRC.DEAL_OPPONENT_CARD_BACK.id);
// Redispatch detector — conditional but its site is required
installPhase2Site('deal.redispatch_attempt', SRC.DEAL_REDISPATCH.id);

// ── Presentation lifecycle production owners (targeted profile) ──
// The 4 presentation components self-emit mount/begin/complete/unmount
// via emitPresentationLifecycle; each invocation registers itself. We
// declare the production owner at import time so `productionOwnerRegistered`
// is truthful for the presentation.lifecycle requirement.
for (const site of [
  SRC.PRES_SWEEPSPOT_MOUNT, SRC.PRES_SWEEPSPOT_BEGIN, SRC.PRES_SWEEPSPOT_COMPLETE, SRC.PRES_SWEEPSPOT_UNMOUNT,
  SRC.PRES_STL_MOUNT,       SRC.PRES_STL_BEGIN,       SRC.PRES_STL_COMPLETE,       SRC.PRES_STL_UNMOUNT,
  SRC.PRES_LTP_MOUNT,       SRC.PRES_LTP_BEGIN,       SRC.PRES_LTP_COMPLETE,       SRC.PRES_LTP_UNMOUNT,
  SRC.PRES_POT_MOUNT,       SRC.PRES_POT_BEGIN,       SRC.PRES_POT_COMPLETE,       SRC.PRES_POT_UNMOUNT,
]) {
  registerWartimeProductionHook({
    requirementId: 'presentation.lifecycle',
    sourceSiteId: site.id,
    sourceFile: site.file,
    sourceFunction: site.fn,
  });
}

// ── Targeted profile: `targeted_357_root_cause` ───────────────
// Enumerates ONLY the invocation sites needed to attribute the six
// remaining root-cause defects: presentation lifecycles (mount/begin/
// complete/unmount for the four owners), geometry decisions and their
// resize observer, progression entry/return at pot completion + game-
// over + 357-win-complete, and per-channel deal transport specificity.
export const TARGETED_357_PROFILE = {
  name: 'targeted_357_root_cause' as const,
  requiredSiteIds: [
    // Presentation lifecycles (16)
    SRC.PRES_SWEEPSPOT_MOUNT.id, SRC.PRES_SWEEPSPOT_BEGIN.id, SRC.PRES_SWEEPSPOT_COMPLETE.id, SRC.PRES_SWEEPSPOT_UNMOUNT.id,
    SRC.PRES_STL_MOUNT.id,       SRC.PRES_STL_BEGIN.id,       SRC.PRES_STL_COMPLETE.id,       SRC.PRES_STL_UNMOUNT.id,
    SRC.PRES_LTP_MOUNT.id,       SRC.PRES_LTP_BEGIN.id,       SRC.PRES_LTP_COMPLETE.id,       SRC.PRES_LTP_UNMOUNT.id,
    SRC.PRES_POT_MOUNT.id,       SRC.PRES_POT_BEGIN.id,       SRC.PRES_POT_COMPLETE.id,       SRC.PRES_POT_UNMOUNT.id,
    // Progression entry/return at every 3-5-7 lifecycle boundary
    SRC.PROG_POT_COMPLETE.id,
    SRC.PROG_HANDLE_GAMEOVER_ENTRY.id,
    SRC.PROG_HANDLE357_WINCOMPLETE.id,
    // Pot destination resolution branches
    SRC.POT_RES_BEGIN.id,
    SRC.POT_RES_CANDIDATES.id,
    SRC.POT_RES_SELECTED.id,
    SRC.POT_RES_COMMITTED.id,
    // Geometry transition (card shrink defect)
    SRC.GEO_BRANCH.id,
    // ResizeObserver on the self-hand (card-shrink attribution)
    SRC.DOM_RO_SELF_HAND.id,
    // Deal channel specificity (deal ownership defect)
    SRC.DEAL_SELF_FACE_UP.id,
    SRC.DEAL_OPPONENT_CARD_BACK.id,
  ] as const,
};

export function checkTargetedReady(): {
  ready: boolean;
  missing: string[];
  installed: string[];
  profile: typeof TARGETED_357_PROFILE.name;
} {
  const installed: string[] = [];
  const missing: string[] = [];
  const invoked = new Set<string>();
  for (const r of listRequirements()) {
    for (const s of r.actualEmitterInvocationSites) invoked.add(s);
  }
  for (const siteId of TARGETED_357_PROFILE.requiredSiteIds) {
    if (invoked.has(siteId)) installed.push(siteId);
    else missing.push(siteId);
  }
  return { ready: missing.length === 0, missing, installed, profile: TARGETED_357_PROFILE.name };
}

export function isTargetedReadyForHarness(context: Record<string, unknown> = {}): boolean {
  const snap = checkTargetedReady();
  if (!snap.ready) {
    emitWartime({
      eventName: 'targeted_not_ready',
      sourceSiteId: SRC.READINESS_GATE.id,
      payload: { profile: snap.profile, missing: snap.missing, installed: snap.installed, context },
    });
  }
  return snap.ready;
}

// ── True preflight gate (pre-round) ─────────────────────────────
// Distinct from `checkTargetedReady()` — which is the POST-repro
// coverage assertion, requiring runtime invocations of presentation
// / pot / geometry / progression sites that CANNOT fire before the
// round starts. Preflight requires ONLY conditions provable before
// `startRound` performs any mutation:
//   - wartime session exists
//   - buildSha + bundle known
//   - coverage manifest already emitted (for this session)
//   - sink round-trip probe passed
//   - zero drops / sink failures / serialization failures
//   - sequence continuity through the sink (persisted+queued+drops covers max seq)
//   - every targeted-profile site is statically registered
//     (file + fn + sourceAnchor) AND its requirement has ≥1
//     registered canonical production owner
// It NEVER requires runtime execution of presentation lifecycle,
// deal channel dispatch, geometry decisions, pot destination
// resolution, progression callbacks, modal lifecycle, or any other
// site that can only occur after the round begins. Those remain
// post-repro integrity requirements (see `postReproIntegrity`).
export interface TargetedPreflightSiteMiss {
  siteId: string;
  missingFile: boolean;
  missingFn: boolean;
  missingAnchor: boolean;
  noProductionOwner: boolean;
  requirementIds: string[];
}

export interface WartimeTargetedPreflightSnapshot {
  preflightReady: boolean;
  reasons: string[];
  sessionId: string | null;
  buildSha: string;
  bundleFilename: string | null;
  coverageManifestEmitted: boolean;
  sink: ReturnType<typeof getSinkCounters>;
  currentMaxSequence: number;
  targetedProfile: typeof TARGETED_357_PROFILE.name;
  targetedSitesRequired: number;
  targetedSitesStaticallyRegistered: number;
  targetedSitesMissing: TargetedPreflightSiteMiss[];
  /** Post-repro coverage completeness — reported here for observability
   *  ONLY. It is NEVER used to gate the preflight. */
  postReproCoverageComplete: boolean;
}

export function checkTargetedPreflight(): WartimeTargetedPreflightSnapshot {
  // Blocking reasons: ONLY conditions that prevent us from collecting
  // any usable trace at all. Everything else is advisory/diagnostic.
  const reasons: string[] = [];
  const warnings: string[] = [];

  const sessionId = getWartimeSessionId();
  if (!sessionId) reasons.push('no-session');

  const sink = getSinkCounters();
  if (!isSinkRoundTripPassed()) reasons.push('sink-round-trip-not-passed');

  // Advisory-only: telemetry health signals. Reported but never block.
  const buildSha = BUILD_IDENTITY.buildSha;
  if (!buildSha) warnings.push('no-build-sha');
  const coverageManifestEmitted = !!sessionId && coverageEmittedForSession === sessionId;
  if (!coverageManifestEmitted) warnings.push('coverage-manifest-not-emitted');
  if (sink.droppedEventCount > 0) warnings.push('dropped-events');
  if (sink.sinkFailureCount > 0) warnings.push('sink-failures');
  if (sink.serializationFailureCount > 0) warnings.push('serialization-failures');
  const maxSeq = currentMaxSequence();
  if (sink.persistedThroughSequence + sink.queueDepth + sink.droppedEventCount < maxSeq) {
    warnings.push('sequence-gap');
  }

  // Static per-site registration check for the targeted profile.
  // Advisory-only: coverage completeness is a diagnostic signal, not a
  // gate. Missing sites are surfaced in the snapshot for observability.
  const reqIndex: Record<string, ReturnType<typeof listRequirements>[number]> = {};
  for (const r of listRequirements()) reqIndex[r.requirementId] = r;
  const missing: TargetedPreflightSiteMiss[] = [];
  let ok = 0;
  for (const siteId of TARGETED_357_PROFILE.requiredSiteIds) {
    const site = getSourceSite(siteId);
    const missingFile = !site || !site.file;
    const missingFn = !site || !site.fn;
    const missingAnchor = !site || !site.sourceAnchor;
    let noProductionOwner = false;
    const requirementIds: string[] = site?.requirementIds ?? [];
    if (!site) {
      noProductionOwner = true;
    } else if (requirementIds.length === 0) {
      noProductionOwner = true;
    } else {
      for (const reqId of requirementIds) {
        const req = reqIndex[reqId];
        if (!req || req.productionSourceSites.length === 0) {
          noProductionOwner = true;
          break;
        }
      }
    }
    if (missingFile || missingFn || missingAnchor || noProductionOwner) {
      missing.push({ siteId, missingFile, missingFn, missingAnchor, noProductionOwner, requirementIds });
    } else {
      ok += 1;
    }
  }
  if (missing.length > 0) warnings.push('targeted-sites-not-statically-registered');

  const postReproCoverageComplete = coverageComplete(WARTIME_REQUIRED_REPRO_PHASE);

  // Merge warnings into reasons for backwards-compatible observability
  // in the emitted snapshot, but the ready flag is driven only by
  // genuine blockers above.
  const allReasons = [...reasons, ...warnings.map((w) => `warn:${w}`)];

  return {
    preflightReady: reasons.length === 0,
    reasons: allReasons,
    sessionId,
    buildSha,
    bundleFilename: BUILD_IDENTITY.bundleFilename || null,
    coverageManifestEmitted,
    sink,
    currentMaxSequence: maxSeq,
    targetedProfile: TARGETED_357_PROFILE.name,
    targetedSitesRequired: TARGETED_357_PROFILE.requiredSiteIds.length,
    targetedSitesStaticallyRegistered: ok,
    targetedSitesMissing: missing,
    postReproCoverageComplete,
  };
}

export interface HarnessPreflightResult {
  preflightReady: boolean;
  snapshot: WartimeTargetedPreflightSnapshot;
}

/**
 * Preflight gate used by `startRound` before ANY mutation. Fails
 * closed but only on conditions that are provable at preflight time.
 * On refusal, emits `preflight_not_ready` with the full snapshot.
 */
export function isTargetedWartimePreflightReadyForHarness(
  context: Record<string, unknown> = {},
): HarnessPreflightResult {
  const snapshot = checkTargetedPreflight();
  if (!snapshot.preflightReady) {
    emitWartime({
      eventName: 'preflight_not_ready',
      sourceSiteId: SRC.READINESS_GATE.id,
      payload: {
        reasons: snapshot.reasons,
        sessionId: snapshot.sessionId,
        buildSha: snapshot.buildSha,
        bundleFilename: snapshot.bundleFilename,
        coverageManifestEmitted: snapshot.coverageManifestEmitted,
        sink: snapshot.sink,
        currentMaxSequence: snapshot.currentMaxSequence,
        targetedProfile: snapshot.targetedProfile,
        targetedSitesRequired: snapshot.targetedSitesRequired,
        targetedSitesStaticallyRegistered: snapshot.targetedSitesStaticallyRegistered,
        targetedSitesMissing: snapshot.targetedSitesMissing,
        postReproCoverageComplete: snapshot.postReproCoverageComplete,
        context,
      },
    });
  }
  return { preflightReady: snapshot.preflightReady, snapshot };
}




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
  // Install global error/unhandled-rejection listeners as early as
  // possible so Phase 3 error-origin capture is armed at page load.
  try {
    const { installGlobalErrorListeners } = await import('./phase3Wiring');
    installGlobalErrorListeners();
  } catch { /* ignore */ }
  emitWartime({
    eventName: 'session_start',
    sourceSiteId: SRC.SESSION_START.id,
    identity: { gameId: null },
    payload: {
      wartimeSessionId: sessionId,
      firstEventSequence: currentMaxSequence() + 1,
      buildSha: BUILD_IDENTITY.buildSha,
      bundleFilename: BUILD_IDENTITY.bundleFilename || null,
      buildTimestamp: BUILD_IDENTITY.buildTimestamp ?? null,
      harnessProfile: 'instant_win',
      implementationPhase: WARTIME_IMPLEMENTATION_PHASE,
      requiredReproPhase: WARTIME_REQUIRED_REPRO_PHASE,
      sourceAnchor: SRC.SESSION_START.sourceAnchor,
      sinkState: getSinkCounters(),
    },
  });
  emitCoverageManifest();
  void runSinkRoundTripProbe(sessionId, BUILD_IDENTITY.buildSha).then((passed) => {
    // integrity.round_trip's production owner + emitter invocation are
    // installed at module import time (see installPhase1Site above).
    // Runtime readiness still requires the probe to actually pass; the
    // event below records the outcome for post-repro integrity.
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
        helperImplemented: r.helperImplemented,
        productionOwnerRegistered: r.productionOwnerRegistered,
        runtimeExercised: r.runtimeExercised,
        helperSourceSiteIds: r.helperSourceSiteIds,
        productionSourceSites: r.productionSourceSites,
        actualEmitterInvocationSites: r.actualEmitterInvocationSites,
        runtimeEventCount: r.runtimeEventCount,
        expectedDuringRepro: r.expectedDuringRepro,
        runtimeExpectation: r.runtimeExpectation,
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
