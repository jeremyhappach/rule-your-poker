/**
 * 3-5-7 Wartime — Coverage Manifest.
 *
 * Per-requirement invocation-site enforcement:
 *   - Every requirement declares a list of required invocation sites
 *     (auto-populated from sourceSites.ts by requirementId).
 *   - `installedInvocationSiteIds` are the required sites that a real
 *     production emitter/wrapper call has installed via
 *     `registerActualEmitterInvocation(reqId, siteId)`.
 *   - `missingInvocationSiteIds` = required − installed.
 *   - `productionOwnerRegistered` = a canonical owner has been
 *     registered AND every required site is installed. An empty
 *     required list fails closed.
 *
 * The legacy `markRequirementInstalled` shim MAY NOT satisfy
 * source-site enforcement on its own. It marks helperImplemented
 * and registers a legacy owner tag, but the site is only marked
 * installed if it appears in this requirement's required list.
 */

import { listSourceSitesForRequirement, type WartimeRuntimeExpectation } from './sourceSites';

export type WartimePhase = 1 | 2 | 3;
export type { WartimeRuntimeExpectation };

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
  /** Per-requirement expectation summary; effective per-site expectations
   *  live on the source-site registry itself. */
  runtimeExpectation: WartimeRuntimeExpectation;
  runtimeEventCount: number;
  expectedDuringRepro: boolean;
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
  runtimeExpectation: WartimeRuntimeExpectation = 'must_emit',
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
    requiredInvocationSiteIds: [],
    installedInvocationSiteIds: [],
    missingInvocationSiteIds: [],
    runtimeExpectation,
    runtimeEventCount: 0,
    expectedDuringRepro: runtimeExpectation === 'must_emit',
  };
}

// ── Phase 1 ────────────────────────────────────────────────────
req('session.envelope',       'Session ID + monotonic sequence + envelope builder',            1, 'preflight_only');
req('coverage.manifest',      'Coverage manifest emitted at session start',                    1, 'preflight_only');
req('integrity.flush',        'Bounded async batched sink flush',                              1, 'must_emit');
req('integrity.round_trip',   'Sink insert+read-back round-trip probe passes',                 1, 'preflight_only');
req('harness.readiness_gate', 'Admin harness instant_win blocked until wartime ready',         1, 'preflight_only');

// ── Phase 2 ────────────────────────────────────────────────────
req('component.mount',                'componentInstanceId mount/unmount on all 3-5-7 owners', 2);
req('component.render_branch',        'Render branch + eligibility gate captured per mount',   2);
req('state.write.win_phase',          'Writes to threeFiveSevenWinPhase',                      2);
req('state.write.sweep_flags',        'Writes to showSweepsPot / showSweepTheLegs357',         2);
req('state.write.sweep_awaiting',     'Writes to sweepAwaitingCelebrationRef',                 2);
req('state.write.win_animation_active','Writes to is357WinAnimationActive',                    2);
req('state.write.show_cards',         'Writes to Show Cards + decision eligibility',           2);
req('state.write.deal_runtime',       'Writes to deal runtime phase/latches',                  2);
req('async.owner_registry',           'Every timer/rAF/promise/realtime has asyncOwnerId',     2, 'preflight_only');
req('db.mutation_causality',          'DB mutation begin/complete/error with requestId',       2, 'preflight_only');
req('realtime.owner',                 'Realtime message ownership + local receipt sequence',   2, 'preflight_only');
req('authoritative.snapshot',         'Authoritative game/round/players/cards at checkpoints', 2);
req('deal.self_face_up',              'Self face-up transport channel fully instrumented',     2);
req('deal.opponent_card_back',        'Opponent card-back transport channel fully instrumented',2);
req('deal.redispatch_attempt',        'Redispatch attempts under stale/terminal identity',     2, 'conditional');

// ── Phase 3 ────────────────────────────────────────────────────
req('deal.self_face_up.channel_settled', 'Self face-up channel conclusively settled/etc',       3);
req('dom.snapshot.checkpoints',          'Targeted DOM snapshot at every required checkpoint',  3);
req('dom.observer.mutation',             'MutationObserver scoped to diagnostic nodes only',    3, 'preflight_only');
req('dom.observer.resize',               'ResizeObserver on layout-critical diagnostic nodes',  3, 'preflight_only');
req('geometry.transition',               'Active-hand geometry decision inputs+outputs+branch', 3);
req('pot_destination.resolution',        'PotToPlayerAnimation destination resolution forensics',3);
req('progression.advancement',           'Entry+return of every 3-5-7 progression callback',    3);
req('global.error.origin',               'window.error / unhandledrejection / boundary / toast',3, 'conditional');
req('db.mutation.correlation',           'DB mutation begin/complete/error at real call sites', 3);
req('realtime.causality',                'Realtime callback ownership at real subscriptions',   3);
req('async.owner',                       'Lifecycle async sites wrapped with wartime ownership',3);

// ── Auto-populate required invocation sites from the registry ──
// Every site registered in sourceSites.ts against a requirementId
// becomes a mandatory invocation site for that requirement, EXCEPT
// legacy aggregate helper entries whose function name is tagged
// "(helper)" or "(aggregate)". Those exist for import-time ownership
// registration only and cannot by themselves satisfy the gate.
function isAggregateHelperFn(fn: string): boolean {
  return /\((helper|aggregate|helper aggregate|alias)[^)]*\)$/i.test(fn.trim());
}

for (const r of Object.values(REQUIREMENTS)) {
  const sites = listSourceSitesForRequirement(r.requirementId);
  const required = sites
    .filter((s) => !isAggregateHelperFn(s.fn))
    .map((s) => s.id);
  r.requiredInvocationSiteIds = required;
  r.missingInvocationSiteIds = [...required];
}

// ── Mutators ───────────────────────────────────────────────────

function recomputeReadiness(r: WartimeRequirementCoverage): void {
  r.installedInvocationSiteIds = r.actualEmitterInvocationSites.filter((id) =>
    r.requiredInvocationSiteIds.includes(id),
  );
  r.missingInvocationSiteIds = r.requiredInvocationSiteIds.filter(
    (id) => !r.actualEmitterInvocationSites.includes(id),
  );
  const requiredSatisfied =
    r.requiredInvocationSiteIds.length > 0 && r.missingInvocationSiteIds.length === 0;
  r.productionOwnerRegistered = r.productionSourceSites.length > 0 && requiredSatisfied;
}

/** Assert that the helper/emitter for a requirement is implemented. */
export function markHelperImplemented(requirementId: string, helperSourceSiteId: string): void {
  const r = REQUIREMENTS[requirementId];
  if (!r) return;
  r.helperImplemented = true;
  if (!r.helperSourceSiteIds.includes(helperSourceSiteId)) {
    r.helperSourceSiteIds.push(helperSourceSiteId);
  }
}

/** Register a canonical production owner site. Ownership requires
 *  (a) at least one owner registered AND (b) every mandatory
 *  invocation site is installed. */
export function registerWartimeProductionHook(hook: WartimeProductionHook): void {
  const r = REQUIREMENTS[hook.requirementId];
  if (!r) return;
  const already = r.productionSourceSites.some(
    (h) => h.sourceSiteId === hook.sourceSiteId && h.sourceFile === hook.sourceFile,
  );
  if (!already) r.productionSourceSites.push(hook);
  recomputeReadiness(r);
}

/** Register that a real emitter/wrapper call at a mandatory site fired
 *  (or was declared to fire) from its canonical production owner. */
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
 * Legacy shim (Phase 1/2). Marks the helper implemented and registers
 * a legacy owner tag. It DOES install `sourceSiteId` as an actual
 * emitter invocation ONLY when the site is in the requirement's
 * required list — otherwise the requirement remains not-ready.
 * A requirement with zero declared mandatory invocation sites will
 * NEVER be satisfied by this shim.
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
  if (r.requiredInvocationSiteIds.includes(sourceSiteId)) {
    registerActualEmitterInvocation(requirementId, sourceSiteId);
  }
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
  missingInvocationSites: { requirementId: string; sourceSiteId: string }[];
  requirementsWithEmptyRequiredList: string[];
}

/** Preflight gate: helper implemented + production owner registered
 *  + every mandatory site installed, at the phase or below. */
export function coverageGate(phase: WartimePhase): CoverageGateResult {
  const missingHelpers: string[] = [];
  const missingProductionOwners: string[] = [];
  const missingActualEmitters: string[] = [];
  const missingInvocationSites: { requirementId: string; sourceSiteId: string }[] = [];
  const requirementsWithEmptyRequiredList: string[] = [];
  for (const r of listRequirements()) {
    if (r.phase > phase) continue;
    if (!r.helperImplemented) missingHelpers.push(r.requirementId);
    if (!r.productionOwnerRegistered) missingProductionOwners.push(r.requirementId);
    if (r.actualEmitterInvocationSites.length === 0) missingActualEmitters.push(r.requirementId);
    if (r.requiredInvocationSiteIds.length === 0) requirementsWithEmptyRequiredList.push(r.requirementId);
    for (const siteId of r.missingInvocationSiteIds) {
      missingInvocationSites.push({ requirementId: r.requirementId, sourceSiteId: siteId });
    }
  }
  return {
    ready:
      missingHelpers.length === 0 &&
      missingProductionOwners.length === 0 &&
      missingActualEmitters.length === 0 &&
      missingInvocationSites.length === 0 &&
      requirementsWithEmptyRequiredList.length === 0,
    missingHelpers,
    missingProductionOwners,
    missingActualEmitters,
    missingInvocationSites,
    requirementsWithEmptyRequiredList,
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
  totalRequiredInvocationSites: number;
  totalInstalledInvocationSites: number;
  totalMissingInvocationSites: number;
  byPhase: Record<WartimePhase, {
    total: number; helpers: number; owners: number; emitters: number; exercised: number;
    requiredSites: number; installedSites: number; missingSites: number;
  }>;
}

export function coverageSummary(): CoverageSummary {
  const all = listRequirements();
  const byPhase: CoverageSummary['byPhase'] = {
    1: { total: 0, helpers: 0, owners: 0, emitters: 0, exercised: 0, requiredSites: 0, installedSites: 0, missingSites: 0 },
    2: { total: 0, helpers: 0, owners: 0, emitters: 0, exercised: 0, requiredSites: 0, installedSites: 0, missingSites: 0 },
    3: { total: 0, helpers: 0, owners: 0, emitters: 0, exercised: 0, requiredSites: 0, installedSites: 0, missingSites: 0 },
  };
  let helpers = 0, owners = 0, emitters = 0, exercised = 0;
  let totalRequired = 0, totalInstalled = 0, totalMissing = 0;
  const missingProductionOwners: string[] = [];
  const missingActualEmitters: string[] = [];
  for (const r of all) {
    byPhase[r.phase].total += 1;
    byPhase[r.phase].requiredSites += r.requiredInvocationSiteIds.length;
    byPhase[r.phase].installedSites += r.installedInvocationSiteIds.length;
    byPhase[r.phase].missingSites += r.missingInvocationSiteIds.length;
    totalRequired += r.requiredInvocationSiteIds.length;
    totalInstalled += r.installedInvocationSiteIds.length;
    totalMissing += r.missingInvocationSiteIds.length;
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
    totalRequiredInvocationSites: totalRequired,
    totalInstalledInvocationSites: totalInstalled,
    totalMissingInvocationSites: totalMissing,
    byPhase,
  };
}

/** Post-repro session integrity: every must_emit requirement must
 *  have runtimeExercised === true, AND every must_emit *site* must
 *  have been actually installed. */
export function postReproIntegrity(): { valid: boolean; unexercised: string[] } {
  const unexercised = listRequirements()
    .filter((r) => r.expectedDuringRepro && !r.runtimeExercised)
    .map((r) => r.requirementId);
  return { valid: unexercised.length === 0, unexercised };
}
