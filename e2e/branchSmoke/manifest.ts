import type { DealerGameType } from '../liveness/support/twoClientSession';

export type Program = 'holm-fold-fold' | 'holm-stay-fold' | 'holm-stay-stay' | '357-drop-drop' | '357-stay-stay' | 'terminal';
export type Scenario = {
  id: string; gameType: DealerGameType; program: Program; coverage: string[];
  legs?: number; cribbageTarget?: number; minHand?: number;
  exerciseCribbageInteractionSeam?: boolean;
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
