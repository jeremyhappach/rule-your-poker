/**
 * 3-5-7 Wartime — static Source-Site manifest.
 *
 * Every wartime emit MUST reference a sourceSiteId registered here.
 * Adding a new site requires a registry entry — this is enforced at
 * emit time.
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
    line: 0,
    requirementIds: ['harness.readiness_gate'],
  }),
  COVERAGE_REPORT: reg({
    id: 'coverage.report',
    file: 'src/lib/threeFiveSeven/wartime/coverage.ts',
    fn: 'emitCoverageManifest',
    line: 0,
    requirementIds: ['coverage.manifest'],
  }),

  // ── Phase 2 (ownership) sites ─────────────────────────────────
  MGT_MOUNT: reg({
    id: 'mgt.mount',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'MobileGameTable',
    line: 1119,
    requirementIds: ['component.mount', 'component.render_branch'],
  }),
  GAME_MOUNT: reg({
    id: 'game.mount',
    file: 'src/pages/Game.tsx',
    fn: 'Game',
    line: 0,
    requirementIds: ['component.mount'],
  }),
  DEAL_ORCH_MOUNT: reg({
    id: 'deal_orch.mount',
    file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx',
    fn: 'ThreeFiveSevenDealOrchestrator',
    line: 0,
    requirementIds: ['component.mount', 'deal.self_face_up', 'deal.opponent_card_back'],
  }),
  POT_ANIM_MOUNT: reg({
    id: 'pot_anim.mount',
    file: 'src/components/PotToPlayerAnimation.tsx',
    fn: 'PotToPlayerAnimation',
    line: 0,
    requirementIds: ['component.mount'],
  }),
  STATE_WIN_PHASE: reg({
    id: 'state.win_phase',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'threeFiveSevenWinPhase observer',
    line: 2160,
    requirementIds: ['state.write.win_phase'],
  }),
  STATE_SWEEP_FLAGS: reg({
    id: 'state.sweep_flags',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'sweep flags observer',
    line: 2127,
    requirementIds: ['state.write.sweep_flags'],
  }),
  STATE_SWEEP_AWAITING: reg({
    id: 'state.sweep_awaiting',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'sweepAwaitingCelebrationRef writer',
    line: 7102,
    requirementIds: ['state.write.sweep_awaiting'],
  }),
  STATE_WIN_ANIM_ACTIVE: reg({
    id: 'state.win_anim_active',
    file: 'src/pages/Game.tsx',
    fn: 'is357WinAnimationActive observer + ref writer',
    line: 1472,
    requirementIds: ['state.write.win_animation_active'],
  }),
  STATE_SHOW_CARDS: reg({
    id: 'state.show_cards',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'show cards eligibility observer',
    line: 5021,
    requirementIds: ['state.write.show_cards'],
  }),
  STATE_DEAL_RUNTIME: reg({
    id: 'state.deal_runtime',
    file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx',
    fn: 'wave decision phase',
    line: 0,
    requirementIds: ['state.write.deal_runtime'],
  }),
  ASYNC_REGISTRY: reg({
    id: 'async.registry',
    file: 'src/lib/threeFiveSeven/wartime/async.ts',
    fn: 'wartimeAsync helpers',
    line: 0,
    requirementIds: ['async.owner_registry'],
  }),
  DB_MUTATION: reg({
    id: 'db.mutation',
    file: 'src/lib/threeFiveSeven/wartime/db.ts',
    fn: 'withWartimeMutation',
    line: 0,
    requirementIds: ['db.mutation_causality'],
  }),
  REALTIME_OWNER: reg({
    id: 'realtime.owner',
    file: 'src/lib/threeFiveSeven/wartime/realtime.ts',
    fn: 'wrapWartimeRealtime',
    line: 0,
    requirementIds: ['realtime.owner'],
  }),
  AUTH_SNAPSHOT: reg({
    id: 'authoritative.snapshot',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'authoritative snapshot emitter',
    line: 0,
    requirementIds: ['authoritative.snapshot'],
  }),
  DEAL_SELF_FACE_UP: reg({
    id: 'deal.self_face_up_channel',
    file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx',
    fn: 'first/full hand visible emitters',
    line: 793,
    requirementIds: ['deal.self_face_up'],
  }),
  DEAL_OPPONENT_CARD_BACK: reg({
    id: 'deal.opponent_card_back_channel',
    file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx',
    fn: 'opponent card-back wave dispatcher',
    line: 0,
    requirementIds: ['deal.opponent_card_back'],
  }),
  DEAL_REDISPATCH: reg({
    id: 'deal.redispatch_detector',
    file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx',
    fn: 'wave dispatch identity guard',
    line: 0,
    requirementIds: ['deal.redispatch_attempt'],
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
