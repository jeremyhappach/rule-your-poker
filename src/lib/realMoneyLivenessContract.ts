import type { DealerGameType } from '@/lib/dealerGameSetupAuthority';

export type RecoveryOwner =
  | 'canonical_timers'
  | 'holm'
  | 'cribbage'
  | 'gin_rummy'
  | 'yahtzee'
  | 'three_five_seven';

export type DeadlinePolicy = 'database' | 'human_untimed_exempt';

export interface LivenessPhaseContract {
  phase: string;
  owner: RecoveryOwner;
  deadlinePolicy: DeadlinePolicy;
  timerKinds: readonly string[];
  actionSurface?: string;
}

export const CANONICAL_SESSION_LIVENESS_PHASES: readonly LivenessPhaseContract[] = [
  {
    phase: 'dealer_selection/configuring',
    owner: 'canonical_timers',
    deadlinePolicy: 'database',
    timerKinds: ['dealer_selection_prepare', 'dealer_selection_complete', 'config_timeout'],
  },
  {
    phase: 'ante_decision',
    owner: 'canonical_timers',
    deadlinePolicy: 'database',
    timerKinds: ['ante_phase'],
  },
];

export const REAL_MONEY_GAME_LIVENESS_CONTRACT = {
  '3-5-7': [
    { phase: 'betting', owner: 'three_five_seven', deadlinePolicy: 'database', timerKinds: ['three_five_seven_decision'], actionSurface: 'holm-357-decision' },
    { phase: 'terminal/presentation', owner: 'three_five_seven', deadlinePolicy: 'database', timerKinds: ['presentation_fallback', 'standard_postgame'] },
  ],
  'holm-game': [
    { phase: 'betting', owner: 'canonical_timers', deadlinePolicy: 'database', timerKinds: ['holm_decision'], actionSurface: 'holm-357-decision' },
    { phase: 'prepared-hand/presentation', owner: 'holm', deadlinePolicy: 'database', timerKinds: ['presentation_fallback'] },
    { phase: 'terminal', owner: 'canonical_timers', deadlinePolicy: 'database', timerKinds: ['standard_postgame'] },
  ],
  horses: [
    { phase: 'playing', owner: 'canonical_timers', deadlinePolicy: 'database', timerKinds: ['horses_scc_turn'], actionSurface: 'horses-scc-turn' },
    { phase: 'terminal', owner: 'canonical_timers', deadlinePolicy: 'database', timerKinds: ['horses_scc_terminal', 'standard_postgame'] },
  ],
  'ship-captain-crew': [
    { phase: 'playing', owner: 'canonical_timers', deadlinePolicy: 'database', timerKinds: ['horses_scc_turn'], actionSurface: 'horses-scc-turn' },
    { phase: 'terminal', owner: 'canonical_timers', deadlinePolicy: 'database', timerKinds: ['horses_scc_terminal', 'standard_postgame'] },
  ],
  yahtzee: [
    { phase: 'playing', owner: 'yahtzee', deadlinePolicy: 'database', timerKinds: ['yahtzee_turn'], actionSurface: 'yahtzee-turn' },
    { phase: 'terminal', owner: 'yahtzee', deadlinePolicy: 'database', timerKinds: ['presentation_fallback'] },
  ],
  cribbage: [
    { phase: 'discarding/pegging-human', owner: 'cribbage', deadlinePolicy: 'human_untimed_exempt', timerKinds: [], actionSurface: 'cribbage-human-turn' },
    { phase: 'bot/counting/terminal', owner: 'cribbage', deadlinePolicy: 'database', timerKinds: ['presentation_fallback'] },
  ],
  'gin-rummy': [
    { phase: 'first_draw/playing-human', owner: 'gin_rummy', deadlinePolicy: 'human_untimed_exempt', timerKinds: [], actionSurface: 'gin-human-turn' },
    { phase: 'bot/scoring/complete', owner: 'gin_rummy', deadlinePolicy: 'database', timerKinds: [] },
  ],
} as const satisfies Record<DealerGameType, readonly LivenessPhaseContract[]>;

export const ALL_REAL_MONEY_GAME_TYPES = Object.freeze(
  Object.keys(REAL_MONEY_GAME_LIVENESS_CONTRACT) as DealerGameType[],
);
