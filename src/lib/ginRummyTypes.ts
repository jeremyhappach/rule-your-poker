// Gin Rummy game types and interfaces
// Reuses the existing card suit symbol encoding standard ('♠','♥','♦','♣')

export interface GinRummyCard {
  suit: '♠' | '♥' | '♦' | '♣';
  rank: string; // 'A','2'-'10','J','Q','K'
  value: number; // Deadwood value: A=1, 2-10 face, J/Q/K=10
}

// A meld is either a set (3-4 same rank) or a run (3+ consecutive same suit)
export type MeldType = 'set' | 'run';

export interface Meld {
  type: MeldType;
  cards: GinRummyCard[];
}

export interface GinRummyPlayerState {
  playerId: string;
  hand: GinRummyCard[];
  melds: Meld[]; // Resolved melds (populated during scoring)
  deadwood: GinRummyCard[]; // Unmelded cards (populated during scoring)
  deadwoodValue: number;
  hasKnocked: boolean;
  hasGin: boolean;
  laidOffCards: GinRummyCard[]; // Cards laid off on opponent's melds (non-knocker only)
}

export type GinRummyPhase =
  | 'dealing'
  | 'first_draw' // Special: non-dealer may take the up-card or pass; then dealer may take or pass → stock draw
  | 'playing' // Draw + discard loop
  | 'knocking' // Knocker arranges melds, opponent sees them
  | 'laying_off' // Opponent lays off cards on knocker's melds (not allowed on gin)
  | 'scoring' // Calculate points
  | 'complete';

export interface GinRummyState {
  phase: GinRummyPhase;
  dealerPlayerId: string;
  nonDealerPlayerId: string;
  playerStates: Record<string, GinRummyPlayerState>;
  turnOrder: [string, string]; // [nonDealer, dealer] – non-dealer acts first

  // Piles
  stockPile: GinRummyCard[]; // Face-down draw pile
  discardPile: GinRummyCard[]; // Face-up discard pile (last element = top)

  // Turn tracking
  currentTurnPlayerId: string;
  turnPhase: 'draw' | 'discard'; // Within a turn: must draw first, then discard
  drawSource: 'stock' | 'discard' | null; // What the current player drew from this turn

  // First-draw sub-phase tracking
  firstDrawOfferedTo: string | null; // Who is being offered the upcard
  firstDrawPassed: string[]; // Who has passed on the upcard

  // Ante / pot
  anteAmount: number;
  pot: number;

  // Game configuration
  pointsToWin: number; // Match target (e.g. 100 or 250)
  matchScores: Record<string, number>; // Cumulative match scores across hands

  // Knock result (populated during scoring)
  knockResult: KnockResult | null;

  // UX helpers
  lastAction?: GinRummyAction | null;
  winnerPlayerId: string | null;
}

export type GinRummyActionType =
  | 'draw_stock'
  | 'draw_discard'
  | 'discard'
  | 'knock'
  | 'gin'
  | 'pass_first_draw'
  | 'lay_off'
  | 'decline_lay_off'; // Opponent done laying off

export interface GinRummyAction {
  type: GinRummyActionType;
  playerId: string;
  card?: GinRummyCard; // The card drawn/discarded/laid-off
  timestamp: string;
}

export interface KnockResult {
  knockerId: string;
  opponentId: string;
  knockerDeadwood: number;
  opponentDeadwood: number;
  isGin: boolean;
  isUndercut: boolean;
  pointsAwarded: number; // Points earned by the round winner
  winnerId: string;
}

// Scoring constants
export const GIN_BONUS = 25; // Bonus for going gin
export const UNDERCUT_BONUS = 25; // Bonus for undercutting the knocker
export const KNOCK_DEADWOOD_LIMIT = 10; // Max deadwood to knock
export const CARDS_PER_PLAYER = 10;
export const STOCK_EXHAUSTION_THRESHOLD = 2; // If stock reaches 2 cards, hand is void

// Match presets
export type GinRummyMatchMode = 'standard' | 'short' | 'quick' | 'custom';

export interface GinRummyMatchModeConfig {
  id: GinRummyMatchMode;
  label: string;
  description: string;
  pointsToWin: number | null; // null for custom
}

export const GIN_RUMMY_MATCH_MODES: GinRummyMatchModeConfig[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: '100 points',
    pointsToWin: 100,
  },
  {
    id: 'short',
    label: 'Short',
    description: '50 points',
    pointsToWin: 50,
  },
  {
    id: 'quick',
    label: 'Quick',
    description: '25 points',
    pointsToWin: 25,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Enter your target',
    pointsToWin: null,
  },
];
