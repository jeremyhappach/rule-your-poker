// Cribbage game types and interfaces

export interface CribbageCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string; // 'A', '2'-'10', 'J', 'Q', 'K'
  value: number; // Point value for pegging (A=1, 2-10 face value, J/Q/K=10)
}

export interface CribbagePlayerState {
  playerId: string;
  hand: CribbageCard[];
  pegScore: number; // Current score on the board (0-121)
  hasCalledGo: boolean;
  discardedToCrib: CribbageCard[];
}

export interface PeggingState {
  playedCards: { playerId: string; card: CribbageCard }[];
  currentCount: number; // Running count (0-31)
  currentTurnPlayerId: string | null;
  lastToPlay: string | null; // For awarding "go" and "last card" points
  goCalledBy: string[]; // Players who have called "go" this count
}

export type CribbagePhase = 
  | 'dealing' 
  | 'discarding' // Players discard to crib
  | 'cutting' // Cut card is revealed
  | 'pegging' // Play cards to 31
  | 'counting' // Count hands
  | 'complete';

export interface CribbageState {
  phase: CribbagePhase;
  dealerPlayerId: string;
  cribOwnerPlayerId: string; // Same as dealer
  playerStates: Record<string, CribbagePlayerState>;
  turnOrder: string[]; // Player IDs in order (non-dealer first for pegging)
  crib: CribbageCard[];
  cutCard: CribbageCard | null;
  pegging: PeggingState;
  anteAmount: number;
  pot: number;
  // Skunk tracking
  winnerPlayerId: string | null;
  loserScore: number | null; // For determining skunk/double-skunk
  payoutMultiplier: number; // 1 = normal, 2 = skunk, 3 = double-skunk
}

// Scoring constants
export const CRIBBAGE_WINNING_SCORE = 121;
export const SKUNK_THRESHOLD = 91; // Loser < 91 = skunk (2x)
export const DOUBLE_SKUNK_THRESHOLD = 61; // Loser < 61 = double-skunk (3x)

// Card dealing rules by player count
export const CARDS_PER_PLAYER: Record<number, number> = {
  2: 6, // Each gets 6, discards 2 to crib
  3: 5, // Each gets 5, discards 1, dealer puts 1 in crib
  4: 5, // Each gets 5, discards 1 each
};

export const DISCARD_COUNT: Record<number, number> = {
  2: 2, // Each discards 2
  3: 1, // Each discards 1
  4: 1, // Each discards 1
};

// Point values for hand evaluation
export interface HandScore {
  fifteens: number;
  pairs: number;
  runs: number;
  flush: number;
  nobs: number; // Jack of same suit as cut card
  total: number;
}

export interface PeggingPoints {
  fifteen: boolean; // 2 points
  thirtyOne: boolean; // 2 points (hitting exactly 31)
  pair: number; // 2 for pair, 6 for three of a kind, 12 for four of a kind
  run: number; // Points = length of run (min 3)
  go: boolean; // 1 point for go
  lastCard: boolean; // 1 point for playing the last card
  total: number;
}
