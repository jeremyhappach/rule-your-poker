/**
 * 3-5-7 Wartime — static Source-Site manifest.
 *
 * Phase 1 (foundation). Every wartime emit MUST reference a
 * sourceSiteId registered here. Adding a new site requires a
 * registry entry — this is enforced at emit time.
 *
 * Later phases (2 = ownership/writes/async/DB/deal; 3 = DOM/
 * observers/geometry/presentation/progression) will add sites.
 */

export interface WartimeSourceSite {
  id: string;
  file: string;
  fn: string;
  line: number;
  requirementIds: string[];
}

const REGISTRY: Record<string, WartimeSourceSite> = {};

function reg(site: WartimeSourceSite): WartimeSourceSite {
  REGISTRY[site.id] = site;
  return site;
}

// ── Phase 1 (foundation) sites ────────────────────────────────
export const SRC = {
  SINK_FLUSH: reg({
    id: 'sink.flush',
    file: 'src/lib/threeFiveSeven/wartime/sink.ts',
    fn: 'flushBatch',
    line: 0,
    requirementIds: ['integrity.flush'],
  }),
  SINK_PROBE: reg({
    id: 'sink.probe',
    file: 'src/lib/threeFiveSeven/wartime/sink.ts',
    fn: 'runSinkRoundTripProbe',
    line: 0,
    requirementIds: ['integrity.round_trip'],
  }),
  SESSION_START: reg({
    id: 'session.start',
    file: 'src/lib/threeFiveSeven/wartime/session.ts',
    fn: 'ensureWartimeSession',
    line: 0,
    requirementIds: ['session.envelope'],
  }),
  READINESS_GATE: reg({
    id: 'readiness.gate',
    file: 'src/lib/threeFiveSeven/wartime/readiness.ts',
    fn: 'checkWartimeReady',
    line: 0,
    requirementIds: ['harness.readiness_gate'],
  }),
  HARNESS_GATED: reg({
    id: 'harness.instant_win_gated',
    file: 'src/lib/gameLogic.ts',
    fn: 'startRound',
    line: 569,
    requirementIds: ['harness.readiness_gate'],
  }),
  COVERAGE_REPORT: reg({
    id: 'coverage.report',
    file: 'src/lib/threeFiveSeven/wartime/coverage.ts',
    fn: 'emitCoverageManifest',
    line: 0,
    requirementIds: ['coverage.manifest'],
  }),
} as const;

export function getSourceSite(id: string): WartimeSourceSite | null {
  return REGISTRY[id] ?? null;
}

export function listSourceSites(): WartimeSourceSite[] {
  return Object.values(REGISTRY);
}

/** Register a source site declared outside this file (future phases). */
export function registerSourceSite(site: WartimeSourceSite): void {
  REGISTRY[site.id] = site;
}
