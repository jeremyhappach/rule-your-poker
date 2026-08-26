import {
  ALL_REAL_MONEY_GAME_TYPES,
  REAL_MONEY_GAME_LIVENESS_CONTRACT,
} from '../../src/lib/realMoneyLivenessContract';
import type { DealerGameType } from '../liveness/support/twoClientSession';

export type ChaosFamily = 'dealer-draw' | 'deadline-rejoin' | 'transition';
export type ChaosScenario = {
  id: string;
  family: ChaosFamily;
  source?: DealerGameType;
  target?: DealerGameType;
  variant?: 'normal' | 'forced-tie' | 'unchanged' | 'changed';
  deadline?: 'dealer-setup' | 'ante' | 'gameplay';
  requiredFaults: readonly ('long-haul' | 'offline-rejoin' | 'route-remount' | 'lost-response')[];
  assertions: readonly string[];
};

const FAULTS = ['long-haul', 'offline-rejoin', 'route-remount', 'lost-response'] as const;
const GAMES = ALL_REAL_MONEY_GAME_TYPES as readonly DealerGameType[];

const shellAssertions = [
  'both clients converge on one current dealer-game identity',
  'one canonical shell and one felt remain mounted per client',
  'no outgoing cards, timer, controls, announcement, or overlay survive the identity change',
  'both clients expose a legal authoritative successor surface',
] as const;

const transitionAssertions = [
  ...shellAssertions,
  'successor configuration equals the requested profile',
  'successor terminal settlement is scoped only to the successor dealer-game identity',
] as const;

/**
 * The single, deterministic inventory for the human-to-human resilience
 * campaign. It deliberately lists N/A human turns (Gin and Cribbage) by not
 * inventing a timeout case for them; their contract explicitly says they are
 * untimed while humans are acting.
 */
export const HUMAN_CHAOS_MANIFEST: readonly ChaosScenario[] = [
  {
    id: 'session-dealer-draw-normal-rejoin',
    family: 'dealer-draw',
    variant: 'normal',
    requiredFaults: FAULTS,
    assertions: ['both clients see the session dealer draw before setup opens', ...shellAssertions],
  },
  {
    id: 'session-dealer-draw-forced-tie-rejoin',
    family: 'dealer-draw',
    variant: 'forced-tie',
    requiredFaults: FAULTS,
    assertions: ['both clients see both tie and redraw waves before setup opens', ...shellAssertions],
  },
  {
    id: 'cribbage-dealer-draw-normal-rejoin',
    family: 'dealer-draw',
    source: 'cribbage',
    variant: 'normal',
    requiredFaults: FAULTS,
    assertions: ['both clients see the Cribbage dealer draw before pegging begins', ...shellAssertions],
  },
  {
    id: 'cribbage-dealer-draw-forced-tie-rejoin',
    family: 'dealer-draw',
    source: 'cribbage',
    variant: 'forced-tie',
    requiredFaults: FAULTS,
    assertions: ['both clients see both Cribbage tie and redraw waves before pegging begins', ...shellAssertions],
  },
  ...GAMES.flatMap((game): ChaosScenario[] => [
    {
      id: `${game}-dealer-setup-timeout-rejoin`,
      family: 'deadline-rejoin',
      source: game,
      deadline: 'dealer-setup',
      requiredFaults: FAULTS,
      assertions: ['the timed-out dealer is resolved by authority once', 'the remaining human can rejoin the resulting legal state', ...shellAssertions],
    },
    {
      id: `${game}-ante-timeout-rejoin`,
      family: 'deadline-rejoin',
      source: game,
      deadline: 'ante',
      requiredFaults: FAULTS,
      assertions: ['the missing ante decision is resolved by authority once', 'the returning human sees the resulting legal state', ...shellAssertions],
    },
  ]),
  ...GAMES
    .filter((game) => REAL_MONEY_GAME_LIVENESS_CONTRACT[game]
      .some((phase) => phase.deadlinePolicy === 'database' && Boolean(phase.actionSurface)))
    .map((game): ChaosScenario => ({
      id: `${game}-gameplay-timeout-rejoin`,
      family: 'deadline-rejoin',
      source: game,
      deadline: 'gameplay',
      requiredFaults: FAULTS,
      assertions: ['the timed-out action is resolved by authority once', 'the returning human sees the next legal action or settled state', ...shellAssertions],
    })),
  ...GAMES.map((game): ChaosScenario => ({
    id: `${game}-run-it-back-unchanged`,
    family: 'transition',
    source: game,
    target: game,
    variant: 'unchanged',
    requiredFaults: FAULTS,
    assertions: transitionAssertions,
  })),
  ...GAMES.map((game): ChaosScenario => ({
    id: `${game}-same-game-changed-parameters`,
    family: 'transition',
    source: game,
    target: game,
    variant: 'changed',
    requiredFaults: FAULTS,
    assertions: transitionAssertions,
  })),
  ...GAMES.flatMap((source) => GAMES
    .filter((target) => target !== source)
    .map((target): ChaosScenario => ({
      id: `${source}-to-${target}`,
      family: 'transition',
      source,
      target,
      requiredFaults: FAULTS,
      assertions: transitionAssertions,
    }))),
];

export function validateHumanChaosManifest(manifest = HUMAN_CHAOS_MANIFEST): void {
  const ids = new Set<string>();
  for (const scenario of manifest) {
    if (ids.has(scenario.id)) throw new Error(`Duplicate human chaos scenario: ${scenario.id}`);
    if (!scenario.assertions.length) throw new Error(`Scenario has no assertions: ${scenario.id}`);
    if (scenario.requiredFaults.length !== FAULTS.length) throw new Error(`Scenario lacks a required fault: ${scenario.id}`);
    ids.add(scenario.id);
  }

  for (const game of GAMES) {
    for (const deadline of ['dealer-setup', 'ante'] as const) {
      if (!manifest.some((scenario) => scenario.source === game && scenario.deadline === deadline)) {
        throw new Error(`Missing ${deadline} coverage for ${game}`);
      }
    }
    if (!manifest.some((scenario) => scenario.id === `${game}-run-it-back-unchanged`)) {
      throw new Error(`Missing Run It Back coverage for ${game}`);
    }
    if (!manifest.some((scenario) => scenario.id === `${game}-same-game-changed-parameters`)) {
      throw new Error(`Missing changed-parameter coverage for ${game}`);
    }
  }

  const timedGames = GAMES.filter((game) => REAL_MONEY_GAME_LIVENESS_CONTRACT[game]
    .some((phase) => phase.deadlinePolicy === 'database' && Boolean(phase.actionSurface)));
  for (const game of timedGames) {
    if (!manifest.some((scenario) => scenario.id === `${game}-gameplay-timeout-rejoin`)) {
      throw new Error(`Missing gameplay timeout coverage for ${game}`);
    }
  }

  const orderedCrossGamePairs = manifest.filter((scenario) => scenario.family === 'transition'
    && scenario.source !== scenario.target);
  if (orderedCrossGamePairs.length !== GAMES.length * (GAMES.length - 1)) {
    throw new Error('Cross-game transition matrix is incomplete');
  }
}

validateHumanChaosManifest();
