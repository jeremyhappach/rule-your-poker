/**
 * Yahtzee Types
 * 
 * Defines all types for the Yahtzee dice game.
 * Yahtzee uses 5 dice, 3 rolls per turn, 13 scoring categories.
 * Players take turns filling all 13 categories; highest total wins.
 */

/** The 13 scoring categories */
export type YahtzeeCategory =
  // Upper section
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  // Lower section
  | 'three_of_a_kind'
  | 'four_of_a_kind'
  | 'full_house'
  | 'small_straight'
  | 'large_straight'
  | 'yahtzee'
  | 'chance';

export const UPPER_CATEGORIES: YahtzeeCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
];

export const LOWER_CATEGORIES: YahtzeeCategory[] = [
  'three_of_a_kind', 'four_of_a_kind', 'full_house',
  'small_straight', 'large_straight', 'yahtzee', 'chance',
];

export const ALL_CATEGORIES: YahtzeeCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

/** Display labels for categories (short for two-row layout) */
export const CATEGORY_LABELS: Record<YahtzeeCategory, string> = {
  ones: '1s',
  twos: '2s',
  threes: '3s',
  fours: '4s',
  fives: '5s',
  sixes: '6s',
  three_of_a_kind: '3K',
  four_of_a_kind: '4K',
  full_house: 'FH',
  small_straight: 'SM',
  large_straight: 'LG',
  yahtzee: 'YZ',
  chance: 'CH',
};

/** Full display names */
export const CATEGORY_FULL_NAMES: Record<YahtzeeCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  three_of_a_kind: '3 of a Kind',
  four_of_a_kind: '4 of a Kind',
  full_house: 'Full House',
  small_straight: 'Sm. Straight',
  large_straight: 'Lg. Straight',
  yahtzee: 'Yahtzee!',
  chance: 'Chance',
};

/** A single die in Yahtzee */
export interface YahtzeeDie {
  value: number; // 1-6, or 0 if not rolled yet
  isHeld: boolean;
}

/** Per-player scorecard */
export interface YahtzeeScorecard {
  /** Scores for each filled category. Undefined = not yet scored. */
  scores: Partial<Record<YahtzeeCategory, number>>;
  /** Number of Yahtzee bonuses earned (each worth 100) */
  yahtzeeBonuses: number;
}

/** Per-player state within a Yahtzee game */
export interface YahtzeePlayerState {
  dice: YahtzeeDie[];
  rollsRemaining: number; // 3 = hasn't rolled, 0 = must score
  isComplete: boolean; // All 13 categories filled
  scorecard: YahtzeeScorecard;
  /** Stable per-roll key for fly-in animation (like horses) */
  rollKey?: number;
}

/** The full Yahtzee state stored in rounds.yahtzee_state JSONB */
export interface YahtzeeState {
  currentTurnPlayerId: string | null;
  playerStates: Record<string, YahtzeePlayerState>;
  gamePhase: 'waiting' | 'playing' | 'complete';
  turnOrder: string[]; // Player IDs in turn order
  /** Current "round" of the scorecard (1-13, each player fills one per round) */
  currentRound: number;
  /** Single-client bot driver */
  botControllerUserId?: string | null;
  /** ISO timestamp deadline for the current turn */
  turnDeadline?: string | null;
}

/** Upper section bonus threshold and value */
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS_VALUE = 35;
