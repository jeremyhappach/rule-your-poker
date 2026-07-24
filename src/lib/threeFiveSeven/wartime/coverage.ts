/**
 * 3-5-7 Wartime — Coverage Manifest (revised model).
 *
 * Each requirement now tracks three independent proofs:
 *   - helperImplemented: the emitter/helper module exists.
 *   - productionOwnerRegistered: the canonical production file has
 *     registered a real call site — a helper existing is NOT proof
 *     of production wiring; registration MUST come from the owner
 *     module, adjacent to the real emitter invocation.
 *   - runtimeExercised: at least one event was emitted from a
 *     registered production source site during this wartime session.
 *
 * Preflight readiness = all required helpers implemented AND all
 * required production owners registered AND sink round-trip healthy.
 * runtimeExercised is expected to remain 0 pre-repro and is enforced
 * only in post-repro session integrity.
 */

export type WartimePhase = 1 | 2 | 3;
export type WartimeRuntimeExpectation = 'preflight_declared' | 'expected_during_repro' | 'conditional_during_repro';

export interface WartimeRequirementCoverage {
  requirementId: string;
  description: string;
  phase: WartimePhase;
  helperImplemented: boolean;
  productionOwnerRegistered: boolean;
  runtimeExercised: boolean;
  helperSourceSiteIds: string[];
  productionSourceSites: WartimeProductionHook[];
  actualEmitterInvocationSites: string[];
  requiredInvocationSiteIds: string[];
  installedInvocationSiteIds: string[];
  missingInvocationSiteIds: string[];
  runtimeEventCount: number;
  expectedDuringRepro: boolean;
  runtimeExpectation: WartimeRuntimeExpectation;
}

export interface WartimeProductionHook {
  requirementId: string;
  sourceSiteId: string;
  sourceFile: string;
  sourceFunction: string;
}

const REQUIREMENTS: Record<string, WartimeRequirementCoverage> = {};

function req(
  requirementId: string,
  description: string,
  phase: WartimePhase,
  runtimeExpectation: WartimeRuntimeExpectation = 'expected_during_repro',
  requiredInvocationSiteIds: string[] = [],
): void {
  REQUIREMENTS[requirementId] = {
    requirementId,
    description,
    phase,
    helperImplemented: false,
    productionOwnerRegistered: false,
    runtimeExercised: false,
    helperSourceSiteIds: [],
    productionSourceSites: [],
    actualEmitterInvocationSites: [],
    requiredInvocationSiteIds: [...requiredInvocationSiteIds],
    installedInvocationSiteIds: [],
    missingInvocationSiteIds: [...requiredInvocationSiteIds],
    runtimeEventCount: 0,
    expectedDuringRepro: runtimeExpectation === 'expected_during_repro',
    runtimeExpectation,
  };
}

// ── Phase 1 ────────────────────────────────────────────────────
req('session.envelope', 'Session ID + monotonic sequence + envelope builder', 1);
req('coverage.manifest', 'Coverage manifest emitted at session start', 1);
req('integrity.flush', 'Bounded async batched sink flush', 1);
req('integrity.round_trip', 'Sink insert+read-back round-trip probe passes', 1);
req('harness.readiness_gate', 'Admin harness instant_win blocked until wartime ready', 1);

// ── Phase 2 ────────────────────────────────────────────────────
req('component.mount', 'componentInstanceId mount/unmount emissions on all 3-5-7 owners', 2);
req('component.render_branch', 'Render branch + eligibility gate captured per mount', 2);
req('state.write.win_phase', 'Instrument writes to threeFiveSevenWinPhase', 2);
req('state.write.sweep_flags', 'Instrument writes to showSweepsPot / showSweepTheLegs357', 2);
req('state.write.sweep_awaiting', 'Instrument writes to sweepAwaitingCelebrationRef', 2);
req('state.write.win_animation_active', 'Instrument writes to is357WinAnimationActive', 2);
req('state.write.show_cards', 'Instrument writes to Show Cards + decision eligibility', 2);
req('state.write.deal_runtime', 'Instrument writes to deal runtime phase/latches', 2);
req('async.owner_registry', 'Every timer/rAF/promise/realtime callback has asyncOwnerId', 2);
req('db.mutation_causality', 'DB mutation begin/complete/error with requestId', 2);
req('realtime.owner', 'Realtime message ownership + local receipt sequence', 2);
req('authoritative.snapshot', 'Authoritative game/round/players/cards snapshot at checkpoints', 2);
req('deal.self_face_up', 'Self face-up transport channel fully instrumented', 2);
req('deal.opponent_card_back', 'Opponent card-back transport channel fully instrumented', 2);
req('deal.redispatch_attempt', 'Redispatch attempts under stale/terminal identity are flagged', 2);

// ── Phase 3 ────────────────────────────────────────────────────
req('deal.self_face_up.channel_settled', 'Self face-up channel conclusively settled/passthrough/suppressed', 3);
req('dom.snapshot.checkpoints', 'Targeted DOM snapshot at every required checkpoint', 3);
req('dom.observer.mutation', 'MutationObserver scoped to diagnostic nodes only', 3);
req('dom.observer.resize', 'ResizeObserver on layout-critical diagnostic nodes only', 3);
req('geometry.transition', 'Active-hand geometry decision inputs+outputs+branch site', 3);
req('pot_destination.resolution', 'PotToPlayerAnimation destination resolution forensics', 3);
req('progression.advancement', 'Entry+return of every 3-5-7 progression/advancement callback', 3);
req('global.error.origin', 'window.error / unhandledrejection / error-boundary / toast origin', 3);
req(
  'db.mutation.correlation',
  'DB mutation begin/complete/error with requestId at real call sites',
  3,
  'expected_during_repro',
  [
    'db.mutation.correlation.record_game_result.instant_win',
    'db.mutation.correlation.snapshot_player_chips.instant_win',
  ],
);
req('realtime.causality', 'Realtime callback ownership + local receipt sequence at real subscriptions', 3);
req(
  'async.owner',
  'Relevant lifecycle async sites wrapped with wartime ownership',
  3,
  'expected_during_repro',
  [
    'async.owner.game.realtime_debounce',
    'async.owner.game.realtime_delayed_fetch',
    'async.owner.game.realtime_fallback_poll',
    'async.owner.game.show_cards_callback',
    'async.owner.game.awaiting_status_poll',
    'async.owner.game.critical_poll',
    'async.owner.game.357_sync_poll',
    'async.owner.game.awaiting_poll',
    'async.owner.game.awaiting_timer',
    'async.owner.game.reante_clear_timer',
    'async.owner.game.357_safety_fallback',
    'async.owner.game.357_safety_extension',
    'async.owner.game.357_progress_poll',
    'async.owner.game.357_poll_stop',
  ],
);

// ── Mutators ───────────────────────────────────────────────────

/** Assert that the helper/emitter for a requirement is implemented. */
export function markHelperImplemented(requirementId: string, helperSourceSiteId: string): void {
  const r = REQUIREMENTS[requirementId];
  if (!r) return;
  r.helperImplemented = true;
  if (!r.helperSourceSiteIds.includes(helperSourceSiteId)) {
    r.helperSourceSiteIds.push(helperSourceSiteId);
  }
}

/** Register a canonical production owner site. MUST be called from
 *  the actual owner module, adjacent to the emitter invocation.
 *  Ownership is only satisfied when every required invocation site
 *  is installed AND the production owner list is non-empty. */
export function registerWartimeProductionHook(hook: WartimeProductionHook): void {
  const r = REQUIREMENTS[hook.requirementId];
  if (!r) return;
  const already = r.productionSourceSites.some(
    (h) => h.sourceSiteId === hook.sourceSiteId && h.sourceFile === hook.sourceFile,
  );
  if (!already) {
    r.productionSourceSites.push(hook);
  }
  recomputeReadiness(r);
}

function recomputeReadiness(r: WartimeRequirementCoverage): void {
  r.installedInvocationSiteIds = r.actualEmitterInvocationSites.filter((id) =>
    r.requiredInvocationSiteIds.includes(id),
  );
  r.missingInvocationSiteIds = r.requiredInvocationSiteIds.filter(
    (id) => !r.actualEmitterInvocationSites.includes(id),
  );
  const requiredSatisfied = r.missingInvocationSiteIds.length === 0;
  r.productionOwnerRegistered = r.productionSourceSites.length > 0 && requiredSatisfied;
}

/** Register that a production owner contains a real runtime emitter call.
 *  This is distinct from importing a helper or registering the owner file. */
export function registerActualEmitterInvocation(requirementId: string, sourceSiteId: string): void {
  const r = REQUIREMENTS[requirementId];
  if (!r) return;
  if (!r.actualEmitterInvocationSites.includes(sourceSiteId)) {
    r.actualEmitterInvocationSites.push(sourceSiteId);
  }
  recomputeReadiness(r);
}

/** Bump the runtime event counter for a requirement (called by emit). */
export function noteRuntimeEvent(requirementId: string): void {
  const r = REQUIREMENTS[requirementId];
  if (!r) return;
  r.runtimeEventCount += 1;
  r.runtimeExercised = true;
}

/**
 * Legacy shim — used by Phase 1/2 modules that self-assert both
 * helper implementation AND production ownership at import time
 * because they live in a single owner module. Kept for backward
 * compatibility; new Phase 3 wiring MUST use markHelperImplemented +
 * registerWartimeProductionHook separately.
 */
export function markRequirementInstalled(requirementId: string, sourceSiteId: string): void {
  const r = REQUIREMENTS[requirementId];
  if (!r) return;
  markHelperImplemented(requirementId, sourceSiteId);
  registerWartimeProductionHook({
    requirementId,
    sourceSiteId,
    sourceFile: '(legacy self-registered)',
    sourceFunction: '(legacy)',
  });
  registerActualEmitterInvocation(requirementId, sourceSiteId);
}

// ── Readers ────────────────────────────────────────────────────

export function listRequirements(): WartimeRequirementCoverage[] {
  return Object.values(REQUIREMENTS);
}

export interface CoverageGateResult {
  ready: boolean;
  missingHelpers: string[];
  missingProductionOwners: string[];
  missingActualEmitters: string[];
}

/** Preflight gate: every required requirement (phase<=phase) must
 *  have helperImplemented && productionOwnerRegistered. */
export function coverageGate(phase: WartimePhase): CoverageGateResult {
  const missingHelpers: string[] = [];
  const missingProductionOwners: string[] = [];
  const missingActualEmitters: string[] = [];
  for (const r of listRequirements()) {
    if (r.phase > phase) continue;
    if (!r.helperImplemented) missingHelpers.push(r.requirementId);
    if (!r.productionOwnerRegistered) missingProductionOwners.push(r.requirementId);
    if (r.actualEmitterInvocationSites.length === 0) missingActualEmitters.push(r.requirementId);
  }
  return {
    ready: missingHelpers.length === 0 && missingProductionOwners.length === 0 && missingActualEmitters.length === 0,
    missingHelpers,
    missingProductionOwners,
    missingActualEmitters,
  };
}

export function coverageComplete(phase: WartimePhase): boolean {
  return coverageGate(phase).ready;
}

export interface CoverageSummary {
  total: number;
  helpersImplemented: number;
  productionOwnersRegistered: number;
  missingProductionOwners: string[];
  missingActualEmitters: string[];
  runtimeExercised: number;
  actualEmitterSites: number;
  byPhase: Record<WartimePhase, { total: number; helpers: number; owners: number; emitters: number; exercised: number }>;
}

export function coverageSummary(): CoverageSummary {
  const all = listRequirements();
  const byPhase: CoverageSummary['byPhase'] = {
    1: { total: 0, helpers: 0, owners: 0, emitters: 0, exercised: 0 },
    2: { total: 0, helpers: 0, owners: 0, emitters: 0, exercised: 0 },
    3: { total: 0, helpers: 0, owners: 0, emitters: 0, exercised: 0 },
  };
  let helpers = 0, owners = 0, emitters = 0, exercised = 0;
  const missingProductionOwners: string[] = [];
  const missingActualEmitters: string[] = [];
  for (const r of all) {
    byPhase[r.phase].total += 1;
    if (r.helperImplemented) { helpers += 1; byPhase[r.phase].helpers += 1; }
    if (r.productionOwnerRegistered) { owners += 1; byPhase[r.phase].owners += 1; }
    else missingProductionOwners.push(r.requirementId);
    if (r.actualEmitterInvocationSites.length > 0) { emitters += 1; byPhase[r.phase].emitters += 1; }
    else missingActualEmitters.push(r.requirementId);
    if (r.runtimeExercised) { exercised += 1; byPhase[r.phase].exercised += 1; }
  }
  return {
    total: all.length,
    helpersImplemented: helpers,
    productionOwnersRegistered: owners,
    missingProductionOwners,
    missingActualEmitters,
    actualEmitterSites: emitters,
    runtimeExercised: exercised,
    byPhase,
  };
}

/** Post-repro session integrity: every expectedDuringRepro requirement
 *  must have runtimeExercised === true. */
export function postReproIntegrity(): { valid: boolean; unexercised: string[] } {
  const unexercised = listRequirements()
    .filter((r) => r.expectedDuringRepro && !r.runtimeExercised)
    .map((r) => r.requirementId);
  return { valid: unexercised.length === 0, unexercised };
}
