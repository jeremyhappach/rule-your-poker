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
  STATE_SHOW_CARDS_GAME: reg({
    id: 'state.show_cards.game_broadcast',
    file: 'src/pages/Game.tsx',
    fn: 'show-cards broadcast callback setWinner357ShowCards',
    line: 0,
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

  // ── Phase 3 (DOM / geometry / progression) sites ──────────────
  DEAL_SELF_FACE_UP_SETTLED: reg({
    id: 'deal.self_face_up_settled',
    file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx',
    fn: 'emitChannelSettled',
    line: 0,
    requirementIds: ['deal.self_face_up.channel_settled'],
  }),
  DOM_SNAPSHOT: reg({
    id: 'dom.snapshot.checkpoints',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'MobileGameTable.captureCanonical357Snapshot checkpoints',
    line: 0,
    requirementIds: ['dom.snapshot.checkpoints'],
  }),
  DOM_MUTATION: reg({
    id: 'dom.observer.mutation',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'MobileGameTable.installTargetedMutationObserver',
    line: 0,
    requirementIds: ['dom.observer.mutation'],
  }),
  DOM_RESIZE: reg({
    id: 'dom.observer.resize',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'MobileGameTable.installTargetedResizeObserver',
    line: 0,
    requirementIds: ['dom.observer.resize'],
  }),
  GEOMETRY_TRANSITION: reg({
    id: 'geometry.transition',
    file: 'src/components/activeHand/ActiveHandFan.tsx',
    fn: 'ActiveHandFan.geometryEffect',
    line: 0,
    requirementIds: ['geometry.transition'],
  }),
  POT_DESTINATION_RESOLUTION: reg({
    id: 'pot_destination.resolution',
    file: 'src/components/PotToPlayerAnimation.tsx',
    fn: 'emitPotDestinationResolution',
    line: 0,
    requirementIds: ['pot_destination.resolution'],
  }),
  PROGRESSION_ADVANCEMENT: reg({
    id: 'progression.advancement',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'emitProgressionAdvancement',
    line: 0,
    requirementIds: ['progression.advancement'],
  }),
  GLOBAL_ERROR_ORIGIN: reg({
    id: 'global.error.origin',
    file: 'src/App.tsx',
    fn: 'App.unhandledrejection + reportGlobalErrorOrigin',
    line: 0,
    requirementIds: ['global.error.origin'],
  }),
  DB_MUTATION_CORRELATION: reg({
    id: 'db.mutation.correlation',
    file: 'src/lib/gameLogic.ts',
    fn: 'withDbMutationCorrelation',
    line: 0,
    requirementIds: ['db.mutation.correlation'],
  }),
  DB_RECORD_RESULT_INSTANT_WIN: reg({
    id: 'db.mutation.correlation.record_game_result.instant_win',
    file: 'src/lib/gameLogic.ts',
    fn: 'instant-win recordGameResult correlation call site',
    line: 0,
    requirementIds: ['db.mutation.correlation'],
  }),
  DB_SNAPSHOT_CHIPS_INSTANT_WIN: reg({
    id: 'db.mutation.correlation.snapshot_player_chips.instant_win',
    file: 'src/lib/gameLogic.ts',
    fn: 'instant-win snapshotPlayerChips correlation call site',
    line: 0,
    requirementIds: ['db.mutation.correlation'],
  }),
  REALTIME_CAUSALITY: reg({
    id: 'realtime.causality',
    file: 'src/pages/Game.tsx',
    fn: 'wrapRealtimeCausality',
    line: 0,
    requirementIds: ['realtime.causality'],
  }),
  REALTIME_SHOW_CARDS: reg({
    id: 'realtime.causality.show_cards_broadcast',
    file: 'src/pages/Game.tsx',
    fn: 'show-cards broadcast subscription callback',
    line: 0,
    requirementIds: ['realtime.causality'],
  }),
  ASYNC_OWNER: reg({
    id: 'async.owner',
    file: 'src/components/MobileGameTable.tsx',
    fn: 'MobileGameTable.lifecycle timers',
    line: 0,
    requirementIds: ['async.owner'],
  }),
  ASYNC_GAME_RT_DEBOUNCE: reg({ id: 'async.owner.game.realtime_debounce', file: 'src/pages/Game.tsx', fn: 'realtime debouncedFetch timeout', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_RT_DELAYED_FETCH: reg({ id: 'async.owner.game.realtime_delayed_fetch', file: 'src/pages/Game.tsx', fn: 'realtime game-type delayed fetch timeout', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_RT_FALLBACK_POLL: reg({ id: 'async.owner.game.realtime_fallback_poll', file: 'src/pages/Game.tsx', fn: 'realtime fallback polling interval', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_SHOW_CARDS_CALLBACK: reg({ id: 'async.owner.game.show_cards_callback', file: 'src/pages/Game.tsx', fn: 'show-cards broadcast callback ownership', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_AWAITING_STATUS_POLL: reg({ id: 'async.owner.game.awaiting_status_poll', file: 'src/pages/Game.tsx', fn: 'awaiting_next_round game_over safety poll', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_CRITICAL_POLL: reg({ id: 'async.owner.game.critical_poll', file: 'src/pages/Game.tsx', fn: 'critical lifecycle polling interval', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_SYNC_POLL: reg({ id: 'async.owner.game.357_sync_poll', file: 'src/pages/Game.tsx', fn: '3-5-7 round sync polling interval', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_AWAITING_POLL: reg({ id: 'async.owner.game.awaiting_poll', file: 'src/pages/Game.tsx', fn: 'awaiting_next_round DB polling interval', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_AWAITING_TIMER: reg({ id: 'async.owner.game.awaiting_timer', file: 'src/pages/Game.tsx', fn: 'awaiting_next_round 4s auto-proceed timer', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_REANTE_CLEAR: reg({ id: 'async.owner.game.reante_clear_timer', file: 'src/pages/Game.tsx', fn: '3-5-7 re-ante message clear timeout', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_SAFETY_FALLBACK: reg({ id: 'async.owner.game.357_safety_fallback', file: 'src/pages/Game.tsx', fn: '3-5-7 game_over safety fallback timeout', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_SAFETY_EXTENSION: reg({ id: 'async.owner.game.357_safety_extension', file: 'src/pages/Game.tsx', fn: '3-5-7 win-animation extension timeout', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_PROGRESS_POLL: reg({ id: 'async.owner.game.357_progress_poll', file: 'src/pages/Game.tsx', fn: '3-5-7 post-animation progress polling interval', line: 0, requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_POLL_STOP: reg({ id: 'async.owner.game.357_poll_stop', file: 'src/pages/Game.tsx', fn: '3-5-7 post-animation poll hard-stop timeout', line: 0, requirementIds: ['async.owner'] }),
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
