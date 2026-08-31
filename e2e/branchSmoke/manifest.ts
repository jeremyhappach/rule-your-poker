import type { DealerGameType } from '../liveness/support/twoClientSession';

export type Program =
  | 'holm-fold-fold'
  | 'holm-stay-fold'
  | 'holm-stay-stay'
  | '357-drop-drop'
  | '357-stay-stay'
  | 'gin-nondealer-take-rejoin'
  | 'gin-dealer-take-after-pass'
  | 'gin-discard-pile-rejoin'
  | 'terminal';
export type Scenario = {
  id: string; gameType: DealerGameType; program: Program; coverage: string[];
  legs?: number; cribbageTarget?: number; minHand?: number;
  exerciseCribbageInteractionSeam?: boolean;
  exerciseCribbagePhaseRejoinMatrix?: boolean;
  cribbageFixtureProfile?:
    | 'near_double_skunk'
    | 'max_pegging_fan'
    | 'perpetual_heels'
    | 'fifteen_run_go_counting'
    | 'crib_flush_qualifying'
    | 'crib_flush_nonqualifying';
  cribbageOpeningPhase?: 'pegging' | 'complete';
};

/** The one authoritative inventory for the browser branch-smoke matrix. */
export const BRANCH_SMOKE_MANIFEST: readonly Scenario[] = [
  { id: 'holm-all-fold-carry', gameType: 'holm-game', program: 'holm-fold-fold', coverage: ['all-fold', 'carry-forward', 'next-hand'] },
  { id: 'holm-solo-chucky', gameType: 'holm-game', program: 'holm-stay-fold', coverage: ['solo-stayer', 'community-reveal', 'chucky-resolution'] },
  { id: 'holm-multi-stay', gameType: 'holm-game', program: 'holm-stay-stay', coverage: ['multiple-stayers', 'showdown', 'winner-or-tie'] },
  { id: '357-both-fold', gameType: '3-5-7', program: '357-drop-drop', legs: 1, coverage: ['both-fold', 'round-resolution', 'terminal-leg'] },
  { id: '357-both-stay', gameType: '3-5-7', program: '357-stay-stay', legs: 1, coverage: ['both-stay', 'opponent-exposure', 'terminal-leg'] },
  { id: '357-regular-and-terminal-leg', gameType: '3-5-7', program: 'terminal', legs: 2, coverage: ['regular-leg', 'leg-continuation', 'terminal-leg'] },
  { id: 'cribbage-multi-hand', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, minHand: 2, coverage: ['discard', 'cut', 'pegging', 'counting', 'next-hand', 'terminal'] },
  { id: 'cribbage-mobile-interaction', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, exerciseCribbageInteractionSeam: true, coverage: ['exact-mobile-viewport', 'deal-arrival-budget', 'discard-hit-test', 'discard-rejoin', 'pegging-rejoin', 'terminal'] },
  { id: 'cribbage-near-double-skunk', gameType: 'cribbage', program: 'terminal', cribbageFixtureProfile: 'near_double_skunk', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'near-target-opening', 'double-skunk-settlement', 'terminal'] },
  { id: 'cribbage-max-pegging-fan', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, cribbageFixtureProfile: 'max_pegging_fan', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'deterministic-first-hand', 'pair-triple-quad-pegging-fan', 'counting-plan', 'terminal'] },
  { id: 'cribbage-his-heels-nonterminal', gameType: 'cribbage', program: 'terminal', cribbageTarget: 31, cribbageFixtureProfile: 'perpetual_heels', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'his-heels', 'nonterminal-cut', 'continued-pegging', 'terminal'] },
  { id: 'cribbage-his-heels-terminal', gameType: 'cribbage', program: 'terminal', cribbageTarget: 2, cribbageFixtureProfile: 'perpetual_heels', cribbageOpeningPhase: 'complete', coverage: ['exact-game-fixture', 'his-heels', 'terminal-from-cut', 'settlement'] },
  { id: 'cribbage-pegging-counting-branches', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, cribbageFixtureProfile: 'max_pegging_fan', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'pair-triple-quad-pegging-fan', 'last-card', 'nondealer-dealer-crib-counting-order', 'pair-and-run-multiplicity-counting', 'terminal'] },
  { id: 'cribbage-terminal-target-skunk-branches', gameType: 'cribbage', program: 'terminal', cribbageFixtureProfile: 'near_double_skunk', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'full-121-target', 'double-skunk-settlement', 'terminal-from-scoring', 'terminal-rejoin'] },
  { id: 'cribbage-phase-rejoin-matrix', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, minHand: 2, cribbageFixtureProfile: 'max_pegging_fan', exerciseCribbagePhaseRejoinMatrix: true, coverage: ['exact-game-fixture', 'discard-rejoin', 'cut-to-pegging-rejoin', 'counting-rejoin', 'successor-hand-rejoin', 'connected-terminal-hold', 'fresh-terminal-redirect'] },
  { id: 'cribbage-pegging-15-31-run-go-reset', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, cribbageFixtureProfile: 'fifteen_run_go_counting', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'pegging-15', 'pegging-31', 'descending-run', 'automatic-go', 'sequence-reset', 'last-card-without-31-double-score', 'terminal'] },
  { id: 'cribbage-counting-fifteen-flush-nobs', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, cribbageFixtureProfile: 'fifteen_run_go_counting', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'counting-fifteens', 'single-run', 'four-card-hand-flush', 'pair', 'nobs', 'quad-pair-crib', 'terminal'] },
  { id: 'cribbage-crib-flush-qualifying', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, cribbageFixtureProfile: 'crib_flush_qualifying', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'four-card-same-suit-crib', 'matching-cut', 'five-card-crib-flush', 'terminal'] },
  { id: 'cribbage-crib-flush-nonqualifying', gameType: 'cribbage', program: 'terminal', cribbageTarget: 61, cribbageFixtureProfile: 'crib_flush_nonqualifying', cribbageOpeningPhase: 'pegging', coverage: ['exact-game-fixture', 'four-card-same-suit-crib', 'off-suit-cut', 'no-four-card-crib-flush', 'terminal'] },
  { id: 'gin-first-upcard-take-rejoin', gameType: 'gin-rummy', program: 'gin-nondealer-take-rejoin', coverage: ['nondealer-takes-first-upcard', 'first-draw-rejoin', 'draw-discard', 'terminal'] },
  { id: 'gin-dealer-upcard-after-pass', gameType: 'gin-rummy', program: 'gin-dealer-take-after-pass', coverage: ['nondealer-pass', 'dealer-takes-first-upcard', 'draw-discard', 'terminal'] },
  { id: 'gin-discard-pile-rejoin', gameType: 'gin-rummy', program: 'gin-discard-pile-rejoin', coverage: ['both-pass', 'stock-draw', 'ordinary-discard', 'ordinary-play-rejoin', 'discard-pile-draw', 'taken-discard-lockout', 'terminal'] },
  { id: 'gin-multi-hand', gameType: 'gin-rummy', program: 'terminal', minHand: 2, coverage: ['first-draw', 'draw-discard', 'knock-or-gin', 'next-hand', 'terminal'] },
  { id: 'horses-round-flow', gameType: 'horses', program: 'terminal', coverage: ['roll', 'lock-in', 'resolution', 'terminal'] },
  { id: 'scc-round-flow', gameType: 'ship-captain-crew', program: 'terminal', coverage: ['roll', 'qualification', 'lock-in', 'resolution', 'terminal'] },
  { id: 'yahtzee-scorecard', gameType: 'yahtzee', program: 'terminal', coverage: ['roll', 'hold-reroll', 'category', 'handoff', 'scorecard-terminal'] },
];

export function validateManifest() {
  const ids = new Set<string>();
  for (const s of BRANCH_SMOKE_MANIFEST) {
    if (ids.has(s.id) || !s.coverage.length) throw new Error(`Invalid branch smoke scenario: ${s.id}`);
    ids.add(s.id);
  }
  for (const game of ['holm-game', '3-5-7', 'cribbage', 'gin-rummy', 'horses', 'ship-captain-crew', 'yahtzee']) {
    if (!BRANCH_SMOKE_MANIFEST.some((s) => s.gameType === game)) throw new Error(`Missing game: ${game}`);
  }
}
