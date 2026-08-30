import { BRANCH_SMOKE_MANIFEST } from '../branchSmoke/manifest';
import { HUMAN_CHAOS_MANIFEST } from '../humanChaos/manifest';
import type { DealerGameType } from '../liveness/support/twoClientSession';
import { ALL_REAL_MONEY_GAME_TYPES } from '../../src/lib/realMoneyLivenessContract';

export const FULL_SEAM_MANIFEST_VERSION = 2 as const;

export type FullSeamGame = 'shared' | DealerGameType;
export type FullSeamScenarioSource = 'branch-smoke' | 'terminal' | 'human-chaos';
export type FullSeamRequirementDisposition = 'executable' | 'missing-driver' | 'justified-n/a';

export type FullSeamScenario = {
  id: string;
  source: FullSeamScenarioSource;
  sourceId: string;
  game: FullSeamGame;
  spec: string;
};

export type FullSeamRequirement = {
  id: string;
  game: FullSeamGame;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topology: 'two-human' | 'three-human' | 'four-human' | 'variable-human';
  contract: string;
  fixture: string | null;
  disposition: FullSeamRequirementDisposition;
  coveredBy: readonly string[];
  justification?: string;
};

const branchScenarios: FullSeamScenario[] = BRANCH_SMOKE_MANIFEST.map((scenario) => ({
  id: `branch/${scenario.id}`,
  source: 'branch-smoke',
  sourceId: scenario.id,
  game: scenario.gameType,
  spec: 'e2e/branchSmoke/allGames.branchSmoke.spec.ts',
}));

const terminalScenarios: FullSeamScenario[] = ALL_REAL_MONEY_GAME_TYPES.map((game) => ({
  id: `terminal/${game}`,
  source: 'terminal',
  sourceId: game,
  game,
  spec: 'e2e/terminal/allGames.terminal.spec.ts',
}));

const lifecycleScenarios: FullSeamScenario[] = HUMAN_CHAOS_MANIFEST.map((scenario) => ({
  id: `lifecycle/${scenario.id}`,
  source: 'human-chaos',
  sourceId: scenario.id,
  game: scenario.source ?? 'shared',
  spec: scenario.family === 'dealer-draw'
    ? 'e2e/humanChaos/dealerDraws.humanChaos.spec.ts'
    : scenario.family === 'deadline-rejoin'
      ? 'e2e/humanChaos/deadlines.humanChaos.spec.ts'
      : 'e2e/humanChaos/transitions.humanChaos.spec.ts',
}));

export const FULL_SEAM_SCENARIOS: readonly FullSeamScenario[] = [
  ...branchScenarios,
  ...terminalScenarios,
  ...lifecycleScenarios,
];

const req = (
  id: string,
  game: FullSeamGame,
  priority: FullSeamRequirement['priority'],
  contract: string,
  coveredBy: readonly string[] = [],
  options: Partial<Pick<FullSeamRequirement, 'topology' | 'fixture' | 'disposition' | 'justification'>> = {},
): FullSeamRequirement => ({
  id,
  game,
  priority,
  topology: options.topology ?? 'two-human',
  contract,
  fixture: options.fixture ?? null,
  disposition: options.disposition ?? (coveredBy.length ? 'executable' : 'missing-driver'),
  coveredBy,
  ...(options.justification ? { justification: options.justification } : {}),
});

const lifecycleIds = (predicate: (id: string) => boolean): string[] => HUMAN_CHAOS_MANIFEST
  .filter((scenario) => predicate(scenario.id))
  .map((scenario) => `lifecycle/${scenario.id}`);

const allLifecycleIds = HUMAN_CHAOS_MANIFEST.map((scenario) => `lifecycle/${scenario.id}`);

export const FULL_SEAM_REQUIREMENTS: readonly FullSeamRequirement[] = [
  req('shared.session-draw-normal-and-tie', 'shared', 1, 'Waiting table reaches both normal and tied/redraw session dealer draws.', [
    'lifecycle/session-dealer-draw-normal-rejoin',
    'lifecycle/session-dealer-draw-forced-tie-rejoin',
  ], { fixture: 'session-dealer-draw-tie-once' }),
  req('shared.session-draw-before-setup', 'shared', 1, 'Every client completes session draw presentation before setup admission.', [
    'lifecycle/session-dealer-draw-normal-rejoin',
    'lifecycle/session-dealer-draw-forced-tie-rejoin',
  ]),
  req('shared.canonical-shell-first-and-later-games', 'shared', 1, 'First and later dealer games enter the same canonical shell without recovery misclassification.', lifecycleIds((id) => id.includes('-to-') || id.endsWith('-run-it-back-unchanged'))),
  req('shared.setup-decisions-and-timeout', 'shared', 1, 'Dealer setup accepts normal, changed, sit-out, and timeout outcomes.'),
  req('shared.ante-decisions-timeout-and-rejoin', 'shared', 1, 'Ante stay, sit-out, lost committed response, timeout, and rejoin converge authoritatively.'),
  req('shared.viewer-participation-identity', 'shared', 1, 'The viewer identity row reports Active, Sitting Out, or Waiting from authoritative participation.'),
  req('shared.first-deal-admission', 'shared', 1, 'Cards, legal controls, and any timer admit only after the ante/deal presentation boundary.'),
  req('shared.terminal-and-continuation', 'shared', 1, 'Connected terminal, ordinary continuation, LAST HAND Session Ended, and fresh-ended lobby admission all hold.'),
  req('shared.single-canonical-owners', 'shared', 1, 'One shell, felt, seat ring, HUD rail, and lifecycle owner survive every transition.', allLifecycleIds),

  req('holm.all-fold-no-tax-no-rabbit', 'holm-game', 4, 'All fold with Pussy Tax and Rabbit Hunt off; carry into the next hand.', ['branch/holm-all-fold-carry']),
  req('holm.all-fold-pussy-tax', 'holm-game', 4, 'All fold with Pussy Tax on; collect exact tax and carry the pot.'),
  req('holm.rabbit-hunt-ordering', 'holm-game', 4, 'Rabbit Hunt reveals hidden community cards in order while tax and successor dwell preserve their owners.'),
  req('holm.solo-beats-chucky', 'holm-game', 4, 'Solo stayer beats Chucky through cards, celebration, transfer, settlement, and postgame.', ['branch/holm-solo-chucky', 'terminal/holm-game']),
  req('holm.solo-loses-or-ties-chucky', 'holm-game', 4, 'Solo stayer loses or ties Chucky with correct match, replacement pot, and continuation.'),
  req('holm.multi-stayer-unique-winner', 'holm-game', 4, 'Multiple stayers produce one winner, loser match, and continuation.', ['branch/holm-multi-stay']),
  req('holm.partial-top-tie', 'holm-game', 4, 'A partial top tie plus loser splits exactly and conserves value.', [], { topology: 'three-human' }),
  req('holm.all-stayers-tie-beat-chucky', 'holm-game', 4, 'All stayers tie and beat Chucky for a split terminal award.'),
  req('holm.all-stayers-tie-chucky-wins', 'holm-game', 4, 'All stayers tie while Chucky wins or ties; matches and continuation remain exact.'),
  req('holm.option-boundaries', 'holm-game', 4, 'Pot cap, Pussy Tax, Rabbit Hunt, and Chucky-card boundaries receive pairwise option coverage.'),
  req('holm.human-timeout-orderings', 'holm-game', 4, 'Human timeout is exercised before and after another committed decision.', lifecycleIds((id) => id === 'holm-game-gameplay-timeout-rejoin')),
  req('holm.next-hand-identity', 'holm-game', 4, 'Buck rotation, no repeat ante, prepared-hand acknowledgement, and stale projection rejection hold.'),

  req('357.both-fold-tax-boundaries', '3-5-7', 5, 'Both fold with Pussy Tax off and on.', ['branch/357-both-fold']),
  req('357.one-stayer-regular-leg', '3-5-7', 5, 'Exactly one stayer buys a regular leg.'),
  req('357.multi-stayer-unique-winner', '3-5-7', 5, 'Multiple stayers produce a unique winner and exact player transfer.', ['branch/357-both-stay']),
  req('357.multi-stayer-tie', '3-5-7', 5, 'Multiple stayers tie with no transfer and correct continuation.'),
  req('357.round-card-and-wild-progression', '3-5-7', 5, 'Rounds 1/2/3 retain 3/5/7 cards and change wild rank.'),
  req('357.rollover-once', '3-5-7', 5, 'Round 3 to new Round 1 collects rollover exactly once and not as opening ante.'),
  req('357.regular-and-terminal-legs', '3-5-7', 5, 'Regular nonterminal leg, terminal leg, and pot/leg-reserve settlement are exact.', ['branch/357-regular-and-terminal-leg', 'terminal/3-5-7']),
  req('357.round-one-instant-sweep', '3-5-7', 5, 'Round 1 instant sweep preserves reveal, overlay, leg/pot transfer, and terminal order.'),
  req('357.option-boundaries', '3-5-7', 5, 'Reveal, legs-to-win, pot cap, leg, rollover, and Pussy Tax boundaries receive pairwise coverage.'),
  req('357.timeout-one-and-all', '3-5-7', 5, 'One or all undecided humans time out once and both clients expose the successor.', lifecycleIds((id) => id === '3-5-7-gameplay-timeout-rejoin')),
  req('357.setup-owner-decline', '3-5-7', 5, 'Setup owner decline or sit-out leaves the remaining roster legal.'),
  req('357.identity-boundary-retirement', '3-5-7', 5, 'Prior cards, timers, controls, overlays, leg cues, and transports retire at every identity boundary.'),

  req('cribbage.dealer-draw-normal-and-tie', 'cribbage', 1, 'Normal and tied/redraw Cribbage dealer selection completes on every client.', [
    'lifecycle/cribbage-dealer-draw-normal-rejoin',
    'lifecycle/cribbage-dealer-draw-forced-tie-rejoin',
  ], { fixture: 'cribbage-dealer-draw-tie-once' }),
  req('cribbage.topologies-and-crib', 'cribbage', 1, 'Two-, three-, and four-human discard and crib construction are exact.', [], { topology: 'variable-human' }),
  req('cribbage.cut-and-his-heels', 'cribbage', 1, 'Cut and His Heels presentation pass in nonterminal and terminal hands.', [
    'branch/cribbage-his-heels-nonterminal',
    'branch/cribbage-his-heels-terminal',
  ], { fixture: 'cribbage-rule-branch-once' }),
  req('cribbage.pegging-branches', 'cribbage', 1, 'Pegging covers 15, 31, pair through quadruple, runs, Go, last card, blocked player, and reset without double-scoring 31.'),
  req('cribbage.counting-order', 'cribbage', 1, 'Counting order is nondealer, dealer, then crib.'),
  req('cribbage.counting-categories', 'cribbage', 1, 'Counting covers fifteens, pairs, run multiplicity, flush boundaries, and nobs.'),
  req('cribbage.terminal-entry-phases', 'cribbage', 1, 'Terminal entry during pegging, His Heels, each hand count, and crib count skips no presentation.'),
  req('cribbage.ordinary-rollover', 'cribbage', 1, 'Ordinary rollover rotates dealer and clears pegging/counting artifacts.', ['branch/cribbage-multi-hand']),
  req('cribbage.targets-and-skunk', 'cribbage', 1, 'All targets plus ordinary, skunk, and double-skunk settlement modes run.'),
  req('cribbage.phase-rejoins', 'cribbage', 1, 'Rejoin works during discard, cut, pegging, counting, successor creation, and terminal presentation.'),
  req('cribbage.human-timeout-na', 'cribbage', 1, 'Human gameplay timeout remains intentionally absent; disconnect only restores authority.', [], {
    disposition: 'justified-n/a',
    justification: 'Cribbage human actions are intentionally untimed by the real-money liveness contract.',
  }),

  req('gin.first-upcard-nondealer-takes', 'gin-rummy', 2, 'Nondealer takes the first upcard.', ['branch/gin-first-upcard-take-rejoin']),
  req('gin.first-upcard-dealer-takes', 'gin-rummy', 2, 'Nondealer passes and dealer takes the upcard.', ['branch/gin-dealer-upcard-after-pass']),
  req('gin.first-upcard-both-pass', 'gin-rummy', 2, 'Both pass and nondealer draws from stock.', ['branch/gin-discard-pile-rejoin']),
  req('gin.stock-discard-and-lockout', 'gin-rummy', 2, 'Stock/discard draws work and the just-taken discard remains locked.', ['branch/gin-discard-pile-rejoin']),
  req('gin.knock-layoff-gin-undercut-void', 'gin-rummy', 2, 'Normal knock, legal layoff, Gin, undercut, and stock-two void all run deterministically.'),
  req('gin.nonterminal-scoring-and-rotation', 'gin-rummy', 2, 'Nonterminal scoring rotates dealer and deals the next hand exactly.', ['branch/gin-multi-hand']),
  req('gin.terminal-outcomes', 'gin-rummy', 2, 'Ordinary knock, Gin, and undercut each reach exact terminal settlement.'),
  req('gin.presets-custom-and-bonuses', 'gin-rummy', 2, 'Every preset plus representative Custom values and configured bonuses are proven.'),
  req('gin.phase-rejoins', 'gin-rummy', 2, 'Rejoin works during first draw, play, knock, layoff, scoring, successor, and terminal presentation.'),
  req('gin.redaction-and-release-order', 'gin-rummy', 2, 'Opponent privacy, masked-card suppression, and post-knock paint-before-result ordering hold.'),
  req('gin.human-timeout-na', 'gin-rummy', 2, 'Human gameplay timeout remains intentionally absent.', [], {
    disposition: 'justified-n/a',
    justification: 'Gin human actions are intentionally untimed by the real-money liveness contract.',
  }),
  req('gin.action-latency-budget', 'gin-rummy', 2, 'Every committed action meets healthy and long-haul actor/peer budgets.', [
    'branch/gin-first-upcard-take-rejoin',
    'branch/gin-dealer-upcard-after-pass',
    'branch/gin-discard-pile-rejoin',
    'branch/gin-multi-hand',
  ]),

  req('horses.roll-hold-release', 'horses', 6, 'First roll, hold/release, reroll, early lock, and third-roll end work.', ['branch/horses-round-flow']),
  req('horses.hand-ranking', 'horses', 6, 'Repeated ranks with ones wild and pure five-ones rank correctly.'),
  req('horses.unique-terminal', 'horses', 6, 'Unique winner settles terminally.', ['terminal/horses']),
  req('horses.tie-carry', 'horses', 6, 'Highest tie carries exact re-ante with same dealer and new hand.'),
  req('horses.make-it-take-it', 'horses', 6, 'Make It Take It off/on preserves turn handoff.'),
  req('horses.timeout-boundaries', 'horses', 6, 'Timeout before roll, after hold, and at final roll auto-completes once.', lifecycleIds((id) => id === 'horses-gameplay-timeout-rejoin')),
  req('horses.phase-rejoins', 'horses', 6, 'Rejoin works during rolls, held dice, result, tie rollover, and terminal presentation.'),

  req('scc.ordered-qualification', 'ship-captain-crew', 6, 'Ship, Captain, then Crew qualify in order across rolls.', ['branch/scc-round-flow']),
  req('scc.partial-and-failed-qualification', 'ship-captain-crew', 6, 'Partial and failed qualification preserve acquired dice.'),
  req('scc.cargo-and-midnight', 'ship-captain-crew', 6, 'Cargo reroll, hold prohibition, early lock, and Midnight auto-lock work.'),
  req('scc.unique-and-tied-results', 'ship-captain-crew', 6, 'Unique qualified winner, qualified tie, and all-No-Qualify tie resolve.'),
  req('scc.tie-carry', 'ship-captain-crew', 6, 'One Tie All Tie carries exact re-ante, same dealer, and successor.'),
  req('scc.make-it-take-it', 'ship-captain-crew', 6, 'Make It Take It off/on preserves turn handoff.'),
  req('scc.timeout-boundaries', 'ship-captain-crew', 6, 'Timeout before, during, and after qualification auto-completes once.', lifecycleIds((id) => id === 'ship-captain-crew-gameplay-timeout-rejoin')),
  req('scc.phase-rejoins', 'ship-captain-crew', 6, 'Rejoin works during qualification, cargo, result, tie rollover, and terminal presentation.'),

  req('yahtzee.roll-hold-score-handoff', 'yahtzee', 3, 'Roll, hold/release, reroll, third-roll limit, category, and next-human handoff work.', ['branch/yahtzee-scorecard']),
  req('yahtzee.every-category-and-scratch', 'yahtzee', 3, 'Every scorecard category plus a deliberate scratch is selected.'),
  req('yahtzee.upper-bonus-boundaries', 'yahtzee', 3, 'Upper bonus immediately below and at threshold is exact.'),
  req('yahtzee.repeat-bonus-and-joker', 'yahtzee', 3, 'Repeat Yahtzee bonus and Joker forced category work.'),
  req('yahtzee.complete-scorecards', 'yahtzee', 3, 'Both humans complete 13 categories with exact terminal scores.', ['branch/yahtzee-scorecard', 'terminal/yahtzee']),
  req('yahtzee.unique-and-tied-terminal', 'yahtzee', 3, 'Unique fixed-stake settlement and tied-scorecard rollover both run.'),
  req('yahtzee.timeout-boundaries', 'yahtzee', 3, 'Timeout before roll, after hold, and before scoring advances or pauses exactly once.', lifecycleIds((id) => id === 'yahtzee-gameplay-timeout-rejoin')),
  req('yahtzee.phase-rejoins', 'yahtzee', 3, 'Rejoin works during rolling, category handoff, terminal presentation, and tie rollover.'),
];

export const MISSING_FULL_SEAM_REQUIREMENT_IDS = FULL_SEAM_REQUIREMENTS
  .filter((requirement) => requirement.disposition === 'missing-driver')
  .map((requirement) => requirement.id);

export function validateFullSeamManifest(): void {
  const scenarioIds = new Set<string>();
  for (const scenario of FULL_SEAM_SCENARIOS) {
    if (scenarioIds.has(scenario.id)) throw new Error(`Duplicate full-seam scenario: ${scenario.id}`);
    scenarioIds.add(scenario.id);
  }

  const requirementIds = new Set<string>();
  for (const requirement of FULL_SEAM_REQUIREMENTS) {
    if (requirementIds.has(requirement.id)) throw new Error(`Duplicate full-seam requirement: ${requirement.id}`);
    requirementIds.add(requirement.id);
    if (requirement.disposition === 'executable' && requirement.coveredBy.length === 0) {
      throw new Error(`Executable requirement has no scenario: ${requirement.id}`);
    }
    if (requirement.disposition === 'justified-n/a' && !requirement.justification) {
      throw new Error(`N/A requirement lacks justification: ${requirement.id}`);
    }
    for (const scenarioId of requirement.coveredBy) {
      if (!scenarioIds.has(scenarioId)) {
        throw new Error(`Requirement ${requirement.id} references unknown scenario ${scenarioId}`);
      }
    }
  }
}

validateFullSeamManifest();
