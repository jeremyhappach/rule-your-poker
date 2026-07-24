/**
 * 3-5-7 Wartime — Coverage Manifest.
 *
 * Enumerates every required instrumentation hook. Each requirement
 * begins uninstalled. Later-phase wiring calls markRequirementInstalled
 * from the exact site that satisfies it. The admin harness readiness
 * gate cannot arm until every required hook reports installed = true.
 *
 * Phase 1 lands the manifest itself: only session/sink/gate
 * requirements are installable. All defect-owner requirements are
 * declared but remain installed=false so the gate stays closed until
 * phase 2/3 wire them.
 */

export type WartimePhase = 1 | 2 | 3;

export interface WartimeRequirement {
  requirementId: string;
  description: string;
  phase: WartimePhase;
  /** Source-site IDs expected to satisfy this requirement. */
  expectedSourceSiteIds: string[];
  installed: boolean;
  installedBySourceSiteIds: string[];
}

const REQUIREMENTS: Record<string, WartimeRequirement> = {};

function req(
  requirementId: string,
  description: string,
  phase: WartimePhase,
  expectedSourceSiteIds: string[] = [],
): void {
  REQUIREMENTS[requirementId] = {
    requirementId,
    description,
    phase,
    expectedSourceSiteIds,
    installed: false,
    installedBySourceSiteIds: [],
  };
}

// ── Phase 1: foundation ───────────────────────────────────────
req('session.envelope', 'Session ID + monotonic sequence + envelope builder', 1, ['session.start']);
req('coverage.manifest', 'Coverage manifest emitted at session start', 1, ['coverage.report']);
req('integrity.flush', 'Bounded async batched sink flush', 1, ['sink.flush']);
req('integrity.round_trip', 'Sink insert+read-back round-trip probe passes', 1, ['sink.probe']);
req('harness.readiness_gate', 'Admin harness instant_win blocked until wartime ready', 1, [
  'readiness.gate',
  'harness.instant_win_gated',
]);

// ── Phase 2: ownership (declared, not installed) ──────────────
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

// ── Phase 3: DOM / geometry / presentation / progression ──────
req('dom.attributes', 'Diagnostic-only data-357-* attributes on all owner nodes', 3);
req('dom.snapshot', 'capture357WartimeDomSnapshot at every required checkpoint', 3);
req('dom.mutation_observer', 'MutationObserver scoped to diagnostic nodes', 3);
req('dom.resize_observer', 'ResizeObserver on layout-critical diagnostic nodes', 3);
req('css.animation_events', 'animationstart/end/cancel + transition* on presentation nodes', 3);
req('geometry.decision', 'Active-hand geometry decision inputs+outputs+branch site', 3);
req('presentation.forensics', 'Presentation mount/begin/destination/complete/unmount', 3);
req('presentation.destination_candidates', 'Every candidate destination node captured + selected', 3);
req('progression.entry_return', 'Entry+return of every progression/modal callback', 3);
req('progression.modal_owner', 'Setup modal + game-surface mount overlap tracked', 3);

export function markRequirementInstalled(requirementId: string, sourceSiteId: string): void {
  const r = REQUIREMENTS[requirementId];
  if (!r) return;
  if (!r.installedBySourceSiteIds.includes(sourceSiteId)) {
    r.installedBySourceSiteIds.push(sourceSiteId);
  }
  r.installed = true;
}

export function listRequirements(): WartimeRequirement[] {
  return Object.values(REQUIREMENTS);
}

export function coverageComplete(phase?: WartimePhase): boolean {
  return listRequirements()
    .filter((r) => (phase == null ? true : r.phase <= phase))
    .every((r) => r.installed);
}

export function coverageSummary(): {
  total: number;
  installed: number;
  missing: string[];
  byPhase: Record<WartimePhase, { total: number; installed: number }>;
} {
  const all = listRequirements();
  const installed = all.filter((r) => r.installed);
  const missing = all.filter((r) => !r.installed).map((r) => r.requirementId);
  const byPhase: Record<WartimePhase, { total: number; installed: number }> = {
    1: { total: 0, installed: 0 },
    2: { total: 0, installed: 0 },
    3: { total: 0, installed: 0 },
  };
  for (const r of all) {
    byPhase[r.phase].total += 1;
    if (r.installed) byPhase[r.phase].installed += 1;
  }
  return { total: all.length, installed: installed.length, missing, byPhase };
}
