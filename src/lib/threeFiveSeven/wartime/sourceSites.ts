/**
 * 3-5-7 Wartime — static Source-Site manifest.
 *
 * Every wartime emit MUST reference a sourceSiteId registered here.
 * Adding a new site requires a registry entry — this is enforced at
 * emit time.
 */

export type WartimeRuntimeExpectation = 'must_emit' | 'conditional' | 'preflight_only';

/**
 * Every mandatory source site is identified by a stable `sourceAnchor`
 * — a dot-format identifier tied to a specific production branch,
 * callback, or emitter call site. Numeric line numbers are forbidden:
 * they are brittle under refactors and produce false positives at the
 * coverage gate. Uniqueness of `sourceAnchor` (and of `id`) is enforced
 * at registration time.
 */
export interface WartimeSourceSite {
  id: string;
  file: string;
  fn: string;
  sourceAnchor: string;
  requirementIds: string[];
  runtimeExpectation: WartimeRuntimeExpectation;
}

const REGISTRY: Record<string, WartimeSourceSite> = {};
const ANCHOR_INDEX: Record<string, string> = {};

function reg(
  site: Omit<WartimeSourceSite, 'runtimeExpectation' | 'sourceAnchor'> & {
    sourceAnchor?: string;
    runtimeExpectation?: WartimeRuntimeExpectation;
  },
): WartimeSourceSite {
  const anchor = site.sourceAnchor ?? site.id;
  if (ANCHOR_INDEX[anchor] && ANCHOR_INDEX[anchor] !== site.id) {
    throw new Error(
      `[wartime] duplicate sourceAnchor "${anchor}" between site "${ANCHOR_INDEX[anchor]}" and "${site.id}"`,
    );
  }
  ANCHOR_INDEX[anchor] = site.id;
  const full: WartimeSourceSite = {
    id: site.id,
    file: site.file,
    fn: site.fn,
    sourceAnchor: anchor,
    requirementIds: site.requirementIds,
    runtimeExpectation: site.runtimeExpectation ?? 'must_emit',
  };
  REGISTRY[full.id] = full;
  return full;
}

// ── Phase 1 (foundation) sites ────────────────────────────────
export const SRC = {
  SINK_FLUSH: reg({ id: 'sink.flush', file: 'src/lib/threeFiveSeven/wartime/sink.ts', fn: 'flushBatch', requirementIds: ['integrity.flush'], runtimeExpectation: 'must_emit' }),
  SINK_PROBE: reg({ id: 'sink.probe', file: 'src/lib/threeFiveSeven/wartime/sink.ts', fn: 'runSinkRoundTripProbe', requirementIds: ['integrity.round_trip'], runtimeExpectation: 'preflight_only' }),
  SESSION_START: reg({ id: 'session.start', file: 'src/lib/threeFiveSeven/wartime/session.ts', fn: 'ensureWartimeSession', requirementIds: ['session.envelope'], runtimeExpectation: 'preflight_only' }),
  READINESS_GATE: reg({ id: 'readiness.gate', file: 'src/lib/threeFiveSeven/wartime/readiness.ts', fn: 'checkWartimeReady', requirementIds: ['harness.readiness_gate'], runtimeExpectation: 'preflight_only' }),
  HARNESS_GATED: reg({ id: 'harness.instant_win_gated', file: 'src/lib/gameLogic.ts', fn: 'startRound', requirementIds: ['harness.readiness_gate'], runtimeExpectation: 'conditional' }),
  COVERAGE_REPORT: reg({ id: 'coverage.report', file: 'src/lib/threeFiveSeven/wartime/coverage.ts', fn: 'emitCoverageManifest', requirementIds: ['coverage.manifest'], runtimeExpectation: 'preflight_only' }),

  // ── Phase 2 (ownership) sites ─────────────────────────────────
  MGT_MOUNT: reg({ id: 'mgt.mount', file: 'src/components/MobileGameTable.tsx', fn: 'MobileGameTable', requirementIds: ['component.mount', 'component.render_branch'] }),
  GAME_MOUNT: reg({ id: 'game.mount', file: 'src/pages/Game.tsx', fn: 'Game', requirementIds: ['component.mount'] }),
  DEAL_ORCH_MOUNT: reg({ id: 'deal_orch.mount', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'ThreeFiveSevenDealOrchestrator', requirementIds: ['component.mount', 'deal.self_face_up', 'deal.opponent_card_back'] }),
  POT_ANIM_MOUNT: reg({ id: 'pot_anim.mount', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'PotToPlayerAnimation', requirementIds: ['component.mount'] }),
  STATE_WIN_PHASE: reg({ id: 'state.win_phase', file: 'src/components/MobileGameTable.tsx', fn: 'threeFiveSevenWinPhase observer', requirementIds: ['state.write.win_phase'] }),
  STATE_SWEEP_FLAGS: reg({ id: 'state.sweep_flags', file: 'src/components/MobileGameTable.tsx', fn: 'sweep flags observer', requirementIds: ['state.write.sweep_flags'] }),
  STATE_SWEEP_AWAITING: reg({ id: 'state.sweep_awaiting', file: 'src/components/MobileGameTable.tsx', fn: 'sweepAwaitingCelebrationRef writer', requirementIds: ['state.write.sweep_awaiting'] }),
  STATE_WIN_ANIM_ACTIVE: reg({ id: 'state.win_anim_active', file: 'src/pages/Game.tsx', fn: 'is357WinAnimationActive observer + ref writer', requirementIds: ['state.write.win_animation_active'] }),
  STATE_SHOW_CARDS: reg({ id: 'state.show_cards', file: 'src/components/MobileGameTable.tsx', fn: 'show cards eligibility observer', requirementIds: ['state.write.show_cards'] }),
  STATE_SHOW_CARDS_GAME: reg({ id: 'state.show_cards.game_broadcast', file: 'src/pages/Game.tsx', fn: 'show-cards broadcast callback setWinner357ShowCards', requirementIds: ['state.write.show_cards'] }),
  STATE_DEAL_RUNTIME: reg({ id: 'state.deal_runtime', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'wave decision phase', requirementIds: ['state.write.deal_runtime'] }),
  ASYNC_REGISTRY: reg({ id: 'async.registry', file: 'src/lib/threeFiveSeven/wartime/async.ts', fn: 'wartimeAsync helpers', requirementIds: ['async.owner_registry'], runtimeExpectation: 'preflight_only' }),
  DB_MUTATION: reg({ id: 'db.mutation', file: 'src/lib/threeFiveSeven/wartime/db.ts', fn: 'withWartimeMutation', requirementIds: ['db.mutation_causality'], runtimeExpectation: 'preflight_only' }),
  REALTIME_OWNER: reg({ id: 'realtime.owner', file: 'src/lib/threeFiveSeven/wartime/realtime.ts', fn: 'wrapWartimeRealtime', requirementIds: ['realtime.owner'], runtimeExpectation: 'preflight_only' }),
  AUTH_SNAPSHOT: reg({ id: 'authoritative.snapshot', file: 'src/components/MobileGameTable.tsx', fn: 'authoritative snapshot emitter', requirementIds: ['authoritative.snapshot'] }),
  DEAL_SELF_FACE_UP: reg({ id: 'deal.self_face_up_channel', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'first/full hand visible emitters', requirementIds: ['deal.self_face_up'] }),
  DEAL_OPPONENT_CARD_BACK: reg({ id: 'deal.opponent_card_back_channel', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'opponent card-back wave dispatcher', requirementIds: ['deal.opponent_card_back'] }),
  DEAL_REDISPATCH: reg({ id: 'deal.redispatch_detector', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'wave dispatch identity guard', requirementIds: ['deal.redispatch_attempt'], runtimeExpectation: 'conditional' }),

  // ── Phase 3 (DOM / geometry / progression) canonical sites ────
  // deal.self_face_up.channel_settled — outcome-branched
  DEAL_SETTLED_NORMAL: reg({ id: 'deal.self_face_up_settled.normal', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled(normal)', requirementIds: ['deal.self_face_up.channel_settled'] }),
  DEAL_SETTLED_PASSTHROUGH: reg({ id: 'deal.self_face_up_settled.passthrough', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled(authoritative passthrough)', requirementIds: ['deal.self_face_up.channel_settled'] }),
  DEAL_SETTLED_REFRESH: reg({ id: 'deal.self_face_up_settled.refresh', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled(refresh/rejoin)', requirementIds: ['deal.self_face_up.channel_settled'] }),
  DEAL_SETTLED_TERMINAL: reg({ id: 'deal.self_face_up_settled.terminal_suppression', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled(terminal suppression)', requirementIds: ['deal.self_face_up.channel_settled'], runtimeExpectation: 'conditional' }),
  DEAL_SETTLED_IDENTITY_MISMATCH: reg({ id: 'deal.self_face_up_settled.identity_mismatch', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled(identity mismatch)', requirementIds: ['deal.self_face_up.channel_settled'], runtimeExpectation: 'conditional' }),
  DEAL_SETTLED_UNMOUNT: reg({ id: 'deal.self_face_up_settled.unmount_before_complete', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled(unmount before complete)', requirementIds: ['deal.self_face_up.channel_settled'], runtimeExpectation: 'conditional' }),

  // dom.snapshot.checkpoints — every enumerated checkpoint
  DOM_SNAP_DEALER_GAME_MOUNT: reg({ id: 'dom.snapshot.dealer_game_surface.mount', file: 'src/components/MobileGameTable.tsx', fn: 'dealer-game surface mount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_DEALER_GAME_UNMOUNT: reg({ id: 'dom.snapshot.dealer_game_surface.unmount', file: 'src/components/MobileGameTable.tsx', fn: 'dealer-game surface unmount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_DEALRUNTIME_MOUNT: reg({ id: 'dom.snapshot.deal_runtime.mount', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'DealRuntime mount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_DEALRUNTIME_UNMOUNT: reg({ id: 'dom.snapshot.deal_runtime.unmount', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'DealRuntime unmount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_BEFORE_FIRST_SELF: reg({ id: 'dom.snapshot.before_first_self_transport', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'before-first-self-transport snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SELF_CARD_COMPLETE: reg({ id: 'dom.snapshot.self_card_transport_complete', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'per-card completion snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_FULL_HAND_VISIBLE: reg({ id: 'dom.snapshot.full_self_hand_visible', file: 'src/components/MobileGameTable.tsx', fn: 'full-hand-visible snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_INSTANT_WIN_DETECT: reg({ id: 'dom.snapshot.instant_win_detection', file: 'src/lib/gameLogic.ts', fn: 'instant-win detection snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SETTLEMENT_BEGIN: reg({ id: 'dom.snapshot.settlement.begin', file: 'src/lib/gameLogic.ts', fn: 'settlement begin snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SETTLEMENT_COMPLETE: reg({ id: 'dom.snapshot.settlement.complete', file: 'src/lib/gameLogic.ts', fn: 'settlement complete snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SWEEP_MOUNT: reg({ id: 'dom.snapshot.sweep_celebration.mount', file: 'src/components/MobileGameTable.tsx', fn: 'sweep celebration mount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SWEEP_BEGIN: reg({ id: 'dom.snapshot.sweep_celebration.begin', file: 'src/components/MobileGameTable.tsx', fn: 'sweep celebration begin snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SWEEP_COMPLETE: reg({ id: 'dom.snapshot.sweep_celebration.complete', file: 'src/components/MobileGameTable.tsx', fn: 'sweep celebration complete snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SWEEP_UNMOUNT: reg({ id: 'dom.snapshot.sweep_celebration.unmount', file: 'src/components/MobileGameTable.tsx', fn: 'sweep celebration unmount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_STL_MOUNT: reg({ id: 'dom.snapshot.sweep_the_legs.mount', file: 'src/components/MobileGameTable.tsx', fn: 'Sweep-the-Legs mount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_STL_BEGIN: reg({ id: 'dom.snapshot.sweep_the_legs.begin', file: 'src/components/MobileGameTable.tsx', fn: 'Sweep-the-Legs begin snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_STL_COMPLETE: reg({ id: 'dom.snapshot.sweep_the_legs.complete', file: 'src/components/MobileGameTable.tsx', fn: 'Sweep-the-Legs complete snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_STL_UNMOUNT: reg({ id: 'dom.snapshot.sweep_the_legs.unmount', file: 'src/components/MobileGameTable.tsx', fn: 'Sweep-the-Legs unmount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_LTP_MOUNT: reg({ id: 'dom.snapshot.legs_to_player.mount', file: 'src/components/MobileGameTable.tsx', fn: 'Legs-to-player mount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_LTP_BEGIN: reg({ id: 'dom.snapshot.legs_to_player.begin', file: 'src/components/MobileGameTable.tsx', fn: 'Legs-to-player begin snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_LTP_COMPLETE: reg({ id: 'dom.snapshot.legs_to_player.complete', file: 'src/components/MobileGameTable.tsx', fn: 'Legs-to-player complete snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_LTP_UNMOUNT: reg({ id: 'dom.snapshot.legs_to_player.unmount', file: 'src/components/MobileGameTable.tsx', fn: 'Legs-to-player unmount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_POT_MOUNT: reg({ id: 'dom.snapshot.pot.mount', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'pot mount snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_POT_DEST_RESOLVED: reg({ id: 'dom.snapshot.pot.destination_resolved', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'pot destination-resolved snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_POT_FLIGHT_BEGIN: reg({ id: 'dom.snapshot.pot.flight_begin', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'pot flight-begin snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_POT_FLIGHT_END: reg({ id: 'dom.snapshot.pot.flight_end', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'pot flight-end snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_GEOMETRY_TRANSITION: reg({ id: 'dom.snapshot.geometry_transition', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry-transition snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_GAME_OVER_ENTRY: reg({ id: 'dom.snapshot.game_over.entry', file: 'src/pages/Game.tsx', fn: 'game-over entry snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_GAME_OVER_EARLY_RETURN: reg({ id: 'dom.snapshot.game_over.early_return', file: 'src/pages/Game.tsx', fn: 'game-over early-return snapshot', requirementIds: ['dom.snapshot.checkpoints'], runtimeExpectation: 'conditional' }),
  DOM_SNAP_ADVANCE_BEGIN: reg({ id: 'dom.snapshot.advancement.begin', file: 'src/pages/Game.tsx', fn: 'advancement begin snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_ADVANCE_COMPLETE: reg({ id: 'dom.snapshot.advancement.complete', file: 'src/pages/Game.tsx', fn: 'advancement complete snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_IDENTITY_CHANGE: reg({ id: 'dom.snapshot.dealer_game.identity_change', file: 'src/components/MobileGameTable.tsx', fn: 'dealer-game identity-change snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_SETUP_MODAL_OPENING: reg({ id: 'dom.snapshot.setup_modal.opening', file: 'src/pages/Game.tsx', fn: 'setup-modal opening snapshot', requirementIds: ['dom.snapshot.checkpoints'] }),
  DOM_SNAP_REDISPATCH_ATTEMPT: reg({ id: 'dom.snapshot.redispatch_attempt', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'redispatch-attempt snapshot', requirementIds: ['dom.snapshot.checkpoints'], runtimeExpectation: 'conditional' }),

  // dom.observer.mutation — per attachment site
  DOM_MO_TABLE_SURFACE: reg({ id: 'dom.observer.mutation.table_surface', file: 'src/components/MobileGameTable.tsx', fn: 'MutationObserver on table/dealer-game surface', requirementIds: ['dom.observer.mutation'], runtimeExpectation: 'preflight_only' }),
  DOM_MO_CELEBRATION_PORTAL: reg({ id: 'dom.observer.mutation.celebration_portal', file: 'src/components/MobileGameTable.tsx', fn: 'MutationObserver on celebration portal host', requirementIds: ['dom.observer.mutation'], runtimeExpectation: 'preflight_only' }),
  DOM_MO_SETUP_MODAL: reg({ id: 'dom.observer.mutation.setup_modal', file: 'src/pages/Game.tsx', fn: 'MutationObserver on setup-modal host', requirementIds: ['dom.observer.mutation'], runtimeExpectation: 'preflight_only' }),

  // dom.observer.resize — per observation target
  DOM_RO_TABLE_CONTAINER: reg({ id: 'dom.observer.resize.table_container', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on table container', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_ACTIVE_PLAYER: reg({ id: 'dom.observer.resize.active_player_box', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on active-player box', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_SELF_HAND: reg({ id: 'dom.observer.resize.self_hand_root', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on self-hand root', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_SELF_CARDS: reg({ id: 'dom.observer.resize.self_card_wrappers', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on self-card wrappers', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_CHIP_CENTER: reg({ id: 'dom.observer.resize.chip_center_targets', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on chip-center targets', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_CHIP_REACTION: reg({ id: 'dom.observer.resize.chip_reaction_targets', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on chip-reaction targets', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_LEGS_TROPHY: reg({ id: 'dom.observer.resize.legs_trophy_targets', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on legs/trophy targets', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_PRESENTATION_ROOTS: reg({ id: 'dom.observer.resize.active_presentation_roots', file: 'src/components/MobileGameTable.tsx', fn: 'ResizeObserver on active presentation roots', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  DOM_RO_SETUP_MODAL: reg({ id: 'dom.observer.resize.setup_modal_root', file: 'src/pages/Game.tsx', fn: 'ResizeObserver on setup-modal root', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),

  // geometry.transition — per selected dimension/branch
  GEO_WIDTH: reg({ id: 'geometry.transition.width', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry width decision', requirementIds: ['geometry.transition'] }),
  GEO_HEIGHT: reg({ id: 'geometry.transition.height', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry height decision', requirementIds: ['geometry.transition'] }),
  GEO_SCALE: reg({ id: 'geometry.transition.scale', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry scale decision', requirementIds: ['geometry.transition'] }),
  GEO_GAP: reg({ id: 'geometry.transition.gap', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry gap decision', requirementIds: ['geometry.transition'] }),
  GEO_RESERVE: reg({ id: 'geometry.transition.reserve', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry reserve decision', requirementIds: ['geometry.transition'] }),
  GEO_BRANCH: reg({ id: 'geometry.transition.branch', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'geometry layout/terminal/show-cards/win-anim branch', requirementIds: ['geometry.transition'] }),

  // pot_destination.resolution — per branch
  POT_RES_BEGIN: reg({ id: 'pot_destination.resolution.begin', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'destination resolution begin', requirementIds: ['pot_destination.resolution'] }),
  POT_RES_CANDIDATES: reg({ id: 'pot_destination.resolution.candidate_collection', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'candidate collection', requirementIds: ['pot_destination.resolution'] }),
  POT_RES_SELECTED: reg({ id: 'pot_destination.resolution.selected', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'selected destination', requirementIds: ['pot_destination.resolution'] }),
  POT_RES_FALLBACK: reg({ id: 'pot_destination.resolution.fallback_branch', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'fallback branch', requirementIds: ['pot_destination.resolution'], runtimeExpectation: 'conditional' }),
  POT_RES_MISSING: reg({ id: 'pot_destination.resolution.missing_failure', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'missing/failure branch', requirementIds: ['pot_destination.resolution'], runtimeExpectation: 'conditional' }),
  POT_RES_COMMITTED: reg({ id: 'pot_destination.resolution.final_committed', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'final coord committed pre-winnerCoords', requirementIds: ['pot_destination.resolution'] }),

  // progression.advancement — per callback
  PROG_SWEEPSPOT_ONCOMPLETE: reg({ id: 'progression.advancement.sweeps_pot.onComplete', file: 'src/components/MobileGameTable.tsx', fn: 'SweepsPotAnimation.onComplete', requirementIds: ['progression.advancement'] }),
  PROG_STL_ONCOMPLETE: reg({ id: 'progression.advancement.sweep_the_legs.onComplete', file: 'src/components/MobileGameTable.tsx', fn: 'SweepTheLegsAnimation.onComplete', requirementIds: ['progression.advancement'] }),
  PROG_POT_COMPLETE: reg({ id: 'progression.advancement.pot_completion', file: 'src/components/MobileGameTable.tsx', fn: 'pot completion callback', requirementIds: ['progression.advancement'] }),
  PROG_ON357_WINCOMPLETE: reg({ id: 'progression.advancement.on357_win_complete', file: 'src/pages/Game.tsx', fn: 'onThreeFiveSevenWinAnimationComplete', requirementIds: ['progression.advancement'] }),
  PROG_HANDLE357_WINCOMPLETE: reg({ id: 'progression.advancement.handle357_win_complete', file: 'src/pages/Game.tsx', fn: 'handleThreeFiveSevenWinAnimationComplete', requirementIds: ['progression.advancement'] }),
  PROG_HANDLE_GAMEOVER_ENTRY: reg({ id: 'progression.advancement.handle_game_over.entry', file: 'src/pages/Game.tsx', fn: 'handleGameOverComplete entry', requirementIds: ['progression.advancement'] }),
  PROG_HANDLE_GAMEOVER_EARLY: reg({ id: 'progression.advancement.handle_game_over.early_return', file: 'src/pages/Game.tsx', fn: 'handleGameOverComplete early returns', requirementIds: ['progression.advancement'], runtimeExpectation: 'conditional' }),
  PROG_SANITIZE_BEGIN: reg({ id: 'progression.advancement.sanitize.begin', file: 'src/pages/Game.tsx', fn: 'sanitize begin', requirementIds: ['progression.advancement'] }),
  PROG_SANITIZE_COMPLETE: reg({ id: 'progression.advancement.sanitize.complete', file: 'src/pages/Game.tsx', fn: 'sanitize complete', requirementIds: ['progression.advancement'] }),
  PROG_ADVANCE_BEGIN: reg({ id: 'progression.advancement.advance.begin', file: 'src/pages/Game.tsx', fn: 'advancement begin', requirementIds: ['progression.advancement'] }),
  PROG_ADVANCE_COMPLETE: reg({ id: 'progression.advancement.advance.complete', file: 'src/pages/Game.tsx', fn: 'advancement complete', requirementIds: ['progression.advancement'] }),
  PROG_MODAL_ELIGIBILITY: reg({ id: 'progression.advancement.modal.eligibility_change', file: 'src/pages/Game.tsx', fn: 'setup-modal eligibility change', requirementIds: ['progression.advancement'] }),
  PROG_MODAL_MOUNT: reg({ id: 'progression.advancement.modal.mount', file: 'src/pages/Game.tsx', fn: 'setup-modal mount', requirementIds: ['progression.advancement'] }),
  PROG_MODAL_UNMOUNT: reg({ id: 'progression.advancement.modal.unmount', file: 'src/pages/Game.tsx', fn: 'setup-modal unmount', requirementIds: ['progression.advancement'] }),

  // global.error.origin — per origin
  GLOBAL_ERR_WINDOW: reg({ id: 'global.error.origin.window_error', file: 'src/App.tsx', fn: 'window.error listener', requirementIds: ['global.error.origin'], runtimeExpectation: 'conditional' }),
  GLOBAL_ERR_UNHANDLED: reg({ id: 'global.error.origin.unhandledrejection', file: 'src/App.tsx', fn: 'unhandledrejection listener', requirementIds: ['global.error.origin'], runtimeExpectation: 'conditional' }),
  GLOBAL_ERR_BOUNDARY: reg({ id: 'global.error.origin.react_error_boundary', file: 'src/App.tsx', fn: 'React error boundary', requirementIds: ['global.error.origin'], runtimeExpectation: 'conditional' }),
  GLOBAL_ERR_TOAST: reg({ id: 'global.error.origin.global_error_toast', file: 'src/App.tsx', fn: 'global error-toast invocation', requirementIds: ['global.error.origin'], runtimeExpectation: 'conditional' }),

  // realtime.causality — per subscription
  RT_GAMES: reg({ id: 'realtime.causality.games', file: 'src/pages/Game.tsx', fn: 'games subscription callback', requirementIds: ['realtime.causality'] }),
  RT_ROUNDS: reg({ id: 'realtime.causality.rounds', file: 'src/pages/Game.tsx', fn: 'rounds subscription callback', requirementIds: ['realtime.causality'] }),
  RT_PLAYERS: reg({ id: 'realtime.causality.players', file: 'src/pages/Game.tsx', fn: 'players subscription callback', requirementIds: ['realtime.causality'] }),
  RT_PLAYER_CARDS: reg({ id: 'realtime.causality.player_cards', file: 'src/pages/Game.tsx', fn: 'player_cards subscription callback', requirementIds: ['realtime.causality'] }),
  RT_GAME_RESULTS: reg({ id: 'realtime.causality.game_results', file: 'src/pages/Game.tsx', fn: 'game_results subscription callback', requirementIds: ['realtime.causality'] }),
  RT_DEALER_GAME: reg({ id: 'realtime.causality.dealer_game_advancement', file: 'src/pages/Game.tsx', fn: 'dealer-game advancement subscription callback', requirementIds: ['realtime.causality'] }),
  RT_SHOW_CARDS: reg({ id: 'realtime.causality.show_cards_broadcast', file: 'src/pages/Game.tsx', fn: 'show-cards broadcast subscription callback', requirementIds: ['realtime.causality'] }),

  // async.owner — 14 lifecycle sites (retained)
  ASYNC_GAME_RT_DEBOUNCE: reg({ id: 'async.owner.game.realtime_debounce', file: 'src/pages/Game.tsx', fn: 'realtime debouncedFetch timeout', requirementIds: ['async.owner'] }),
  ASYNC_GAME_RT_DELAYED_FETCH: reg({ id: 'async.owner.game.realtime_delayed_fetch', file: 'src/pages/Game.tsx', fn: 'realtime game-type delayed fetch timeout', requirementIds: ['async.owner'] }),
  ASYNC_GAME_RT_FALLBACK_POLL: reg({ id: 'async.owner.game.realtime_fallback_poll', file: 'src/pages/Game.tsx', fn: 'realtime fallback polling interval', requirementIds: ['async.owner'] }),
  ASYNC_GAME_SHOW_CARDS_CALLBACK: reg({ id: 'async.owner.game.show_cards_callback', file: 'src/pages/Game.tsx', fn: 'show-cards broadcast callback ownership', requirementIds: ['async.owner'] }),
  ASYNC_GAME_AWAITING_STATUS_POLL: reg({ id: 'async.owner.game.awaiting_status_poll', file: 'src/pages/Game.tsx', fn: 'awaiting_next_round game_over safety poll', requirementIds: ['async.owner'] }),
  ASYNC_GAME_CRITICAL_POLL: reg({ id: 'async.owner.game.critical_poll', file: 'src/pages/Game.tsx', fn: 'critical lifecycle polling interval', requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_SYNC_POLL: reg({ id: 'async.owner.game.357_sync_poll', file: 'src/pages/Game.tsx', fn: '3-5-7 round sync polling interval', requirementIds: ['async.owner'] }),
  ASYNC_GAME_AWAITING_POLL: reg({ id: 'async.owner.game.awaiting_poll', file: 'src/pages/Game.tsx', fn: 'awaiting_next_round DB polling interval', requirementIds: ['async.owner'] }),
  ASYNC_GAME_AWAITING_TIMER: reg({ id: 'async.owner.game.awaiting_timer', file: 'src/pages/Game.tsx', fn: 'awaiting_next_round 4s auto-proceed timer', requirementIds: ['async.owner'] }),
  ASYNC_GAME_REANTE_CLEAR: reg({ id: 'async.owner.game.reante_clear_timer', file: 'src/pages/Game.tsx', fn: '3-5-7 re-ante message clear timeout', requirementIds: ['async.owner'], runtimeExpectation: 'conditional' }),
  ASYNC_GAME_357_SAFETY_FALLBACK: reg({ id: 'async.owner.game.357_safety_fallback', file: 'src/pages/Game.tsx', fn: '3-5-7 game_over safety fallback timeout', requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_SAFETY_EXTENSION: reg({ id: 'async.owner.game.357_safety_extension', file: 'src/pages/Game.tsx', fn: '3-5-7 win-animation extension timeout', requirementIds: ['async.owner'], runtimeExpectation: 'conditional' }),
  ASYNC_GAME_357_PROGRESS_POLL: reg({ id: 'async.owner.game.357_progress_poll', file: 'src/pages/Game.tsx', fn: '3-5-7 post-animation progress polling interval', requirementIds: ['async.owner'] }),
  ASYNC_GAME_357_POLL_STOP: reg({ id: 'async.owner.game.357_poll_stop', file: 'src/pages/Game.tsx', fn: '3-5-7 post-animation poll hard-stop timeout', requirementIds: ['async.owner'] }),

  // db.mutation.correlation — every claimed instant-win DB mutation
  DB_RECORD_RESULT_INSTANT_WIN: reg({ id: 'db.mutation.correlation.record_game_result.instant_win', file: 'src/lib/gameLogic.ts', fn: 'instant-win recordGameResult correlation', requirementIds: ['db.mutation.correlation'] }),
  DB_SNAPSHOT_CHIPS_INSTANT_WIN: reg({ id: 'db.mutation.correlation.snapshot_player_chips.instant_win', file: 'src/lib/gameLogic.ts', fn: 'instant-win snapshotPlayerChips correlation', requirementIds: ['db.mutation.correlation'] }),

  // Legacy aggregate helper entries retained for backward-compat lookups.
  DOM_SNAPSHOT: reg({ id: 'dom.snapshot.checkpoints', file: 'src/components/MobileGameTable.tsx', fn: 'captureCanonical357Snapshot (aggregate helper)', requirementIds: ['dom.snapshot.checkpoints'], runtimeExpectation: 'preflight_only' }),
  DOM_MUTATION: reg({ id: 'dom.observer.mutation', file: 'src/components/MobileGameTable.tsx', fn: 'installTargetedMutationObserver (helper)', requirementIds: ['dom.observer.mutation'], runtimeExpectation: 'preflight_only' }),
  DOM_RESIZE: reg({ id: 'dom.observer.resize', file: 'src/components/MobileGameTable.tsx', fn: 'installTargetedResizeObserver (helper)', requirementIds: ['dom.observer.resize'], runtimeExpectation: 'preflight_only' }),
  GEOMETRY_TRANSITION: reg({ id: 'geometry.transition', file: 'src/components/activeHand/ActiveHandFan.tsx', fn: 'emitGeometryTransition (helper)', requirementIds: ['geometry.transition'], runtimeExpectation: 'preflight_only' }),
  POT_DESTINATION_RESOLUTION: reg({ id: 'pot_destination.resolution', file: 'src/components/PotToPlayerAnimation.tsx', fn: 'emitPotDestinationResolution (helper)', requirementIds: ['pot_destination.resolution'], runtimeExpectation: 'preflight_only' }),
  PROGRESSION_ADVANCEMENT: reg({ id: 'progression.advancement', file: 'src/components/MobileGameTable.tsx', fn: 'emitProgressionAdvancement (helper)', requirementIds: ['progression.advancement'], runtimeExpectation: 'preflight_only' }),
  GLOBAL_ERROR_ORIGIN: reg({ id: 'global.error.origin', file: 'src/App.tsx', fn: 'reportGlobalErrorOrigin (helper)', requirementIds: ['global.error.origin'], runtimeExpectation: 'preflight_only' }),
  DB_MUTATION_CORRELATION: reg({ id: 'db.mutation.correlation', file: 'src/lib/gameLogic.ts', fn: 'withDbMutationCorrelation (helper)', requirementIds: ['db.mutation.correlation'], runtimeExpectation: 'preflight_only' }),
  REALTIME_CAUSALITY: reg({ id: 'realtime.causality', file: 'src/pages/Game.tsx', fn: 'wrapRealtimeCausality (helper)', requirementIds: ['realtime.causality'], runtimeExpectation: 'preflight_only' }),
  REALTIME_SHOW_CARDS: reg({ id: 'realtime.causality.show_cards_broadcast', file: 'src/pages/Game.tsx', fn: '(alias) show-cards broadcast subscription', requirementIds: ['realtime.causality'], runtimeExpectation: 'preflight_only' }),
  ASYNC_OWNER: reg({ id: 'async.owner', file: 'src/components/MobileGameTable.tsx', fn: 'MobileGameTable.lifecycle timers (aggregate helper)', requirementIds: ['async.owner'], runtimeExpectation: 'preflight_only' }),
  DEAL_SELF_FACE_UP_SETTLED: reg({ id: 'deal.self_face_up_settled', file: 'src/components/ThreeFiveSevenDealOrchestrator.tsx', fn: 'emitChannelSettled (helper aggregate)', requirementIds: ['deal.self_face_up.channel_settled'], runtimeExpectation: 'preflight_only' }),
} as const;

export function getSourceSite(id: string): WartimeSourceSite | null {
  return REGISTRY[id] ?? null;
}

export function listSourceSites(): WartimeSourceSite[] {
  return Object.values(REGISTRY);
}

/** Return every site registered against a given requirement (in registration order). */
export function listSourceSitesForRequirement(requirementId: string): WartimeSourceSite[] {
  return Object.values(REGISTRY).filter((s) => s.requirementIds.includes(requirementId));
}

/** Register a source site declared outside this file (future phases). */
export function registerSourceSite(site: WartimeSourceSite): void {
  REGISTRY[site.id] = site;
}
