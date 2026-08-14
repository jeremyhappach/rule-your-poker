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
  /**
   * Monotonic identity for every authoritative pegging action. It advances
   * for a played card and for a declared Go, so a delayed snapshot can never
   * replace a newer pegging score with an earlier one.
   */
  eventSequence?: number;
  currentTurnPlayerId: string | null;
  lastToPlay: string | null; // For awarding "go" and "last card" points
  goCalledBy: string[]; // Players who have called "go" this count
  sequenceStartIndex: number; // Index into playedCards where current sequence starts (for UI clearing)
  /**
   * Presentation latch for the immediate-Go resolution case: when the
   * spotlight holder plays a card that leaves NO player with a legal
   * play at the new count, `advanceToNextPeggingTurn` awards the +1 Go
   * point and calls `beginNewPeggingRun` in the same reducer, which
   * clears `goCalledBy`. Without this latch the Go bubble would never
   * be rendered for the blocked opponent(s). Populated with the
   * auto-added blocked players in that branch and preserved across
   * the run reset. Cleared on the next `playPeggingCard` (fresh run
   * begins), on a new hand, or when phase leaves 'pegging'.
   */
  pendingGoBubblePlayerIds?: string[];
}

export type CribbageEventType =
  | 'pegging_points'
  | 'go_point'
  | 'his_heels'
  | 'hand_count';

export interface CribbageEvent {
  id: string;
  type: CribbageEventType;
  playerId: string;
  points: number;
  label: string;
  createdAt: string;
  count?: number; // pegging count after the action (0-31)
}

export interface CribbageHandCountSummary {
  countedAt: string;
  playerHandScores: Record<string, HandScore>;
  dealerHandScore: HandScore;
  cribScore: HandScore;
}

/**
 * Immutable score sequence committed with the transition into counting.
 * `pegScore` remains the settled match score; this plan is the authoritative
 * source for the incremental counting presentation until settlement.
 */
export interface CribbageCountingPlanTarget {
  playerId: string;
  type: 'hand' | 'crib';
  comboPoints: number[];
  totalPoints: number;
}

export interface CribbageCountingPlan {
  version: 1;
  baselineScores: Record<string, number>;
  targets: CribbageCountingPlanTarget[];
}

/** Database-owned result of resolving a completed counting plan. */
export interface CribbageCountingResolution {
  version: 1 | 2;
  outcome: 'ready' | 'prepared' | 'active' | 'terminal';
  resolvedAt: string;
  successorRoundId?: string;
  successorHandNumber?: number;
  presentationReleaseAt?: string;
  presentationFallbackAt?: string;
}

export type CribbagePhase = 
  | 'dealer-select' // High-card draw / cut for first dealer (incl. tie redraws)
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
  // Game configuration (from dealer setup)
  pointsToWin: number; // Configurable winning score (default 121)
  skunkEnabled: boolean;
  skunkThreshold: number; // Loser below this = skunk (2x)
  doubleSkunkEnabled: boolean;
  doubleSkunkThreshold: number; // Loser below this = double-skunk (3x)
  // UX / debugging helpers
  lastEvent?: CribbageEvent | null;
  lastHandCount?: CribbageHandCountSummary | null;
  /** ISO timestamp written once when counting phase begins — used as a shared sync anchor
   *  so reconnecting clients can skip ahead to the approximate counting position. */
  countingStartedAt?: string | null;
  /** Stable hand identifier for the current counting session (e.g. "dealerGameId:handNumber").
   *  Used to validate that reconnect progress matches the active hand. */
  countingHandKey?: string | null;
  /** Index into the deterministic counting-target list (0=pone, 1=dealer, 2=crib).
   *  Persisted during counting so reconnecting clients know which hand is active. */
  countingTargetIndex?: number | null;
  /** Index of the current scoring combo within the active target (-1=pre-combo/entering).
   *  Persisted during counting for reconnect beat-level resume. */
  countingBeatIndex?: number | null;
  /** Immutable, database-persisted source for counting-phase score presentation. */
  countingPlan?: CribbageCountingPlan | null;
  /** Durable counting outcome; presentation may safely lag this state. */
  countingResolution?: CribbageCountingResolution | null;
  // Skunk tracking
  winnerPlayerId: string | null;
  loserScore: number | null; // For determining skunk/double-skunk
  payoutMultiplier: number; // 1 = normal, 2 = skunk, 3 = double-skunk

  // ── Phase C prerequisites: dealer-selection identity dims ──────────────────
  /**
   * Monotonic cohort counter for dealer-selection. Increments on every tie
   * redraw so identity boundaries are clean across high-card-draw retries.
   * 0 = first/only selection cohort. Persists at last value once dealer is
   * resolved; reset only at dealerGame boundary.
   */
  dealerSelectionCohort?: number;
  /**
   * Latch flipped to true once a dealer has been definitively chosen
   * (i.e. lifecycle has progressed past `dealer-select`). Provides a
   * monotonic dimension distinguishing pre-/post-resolution snapshots
   * within the same cohort. Required for canonical announcement
   * sequencing (`dealer_selected`) before Phase C surface migration.
   */
  dealerResolved?: boolean;

  /**
   * Phase E prerequisite: monotonic latch flipped to true the first
   * time `phase === 'complete'` (match end). Provides a top-bit
   * progress dimension so reconnecting clients cannot regress out of
   * a terminal match snapshot, and so canonical `match_win`
   * announcement sequencing has a presentation-safe identity to key
   * on. Once true within a dealerGame, never flips back; reset only
   * at dealerGame boundary by the next `initializeCribbageGame`.
   */
  matchCompleteLatch?: boolean;
}

// Scoring constants
export const CRIBBAGE_WINNING_SCORE = 121;
export const SKUNK_THRESHOLD = 91; // Loser < 91 = skunk (2x)
export const DOUBLE_SKUNK_THRESHOLD = 61; // Loser < 61 = double-skunk (3x)

// Preset game modes for dealer setup
export type CribbageGameMode = 'full' | 'half' | 'super_quick' | 'sprint' | 'custom';

export interface CribbageGameModeConfig {
  id: CribbageGameMode;
  label: string;
  description: string;
  pointsToWin: number | null; // null for custom mode (user enters value)
  skunkThreshold: number;      // Only applies if skunks enabled
  doubleSkunkThreshold: number | null; // null = no double skunk for this mode
}

export const CRIBBAGE_GAME_MODES: CribbageGameModeConfig[] = [
  {
    id: 'full',
    label: 'Full Game',
    description: '121 points',
    pointsToWin: 121,
    skunkThreshold: 91,
    doubleSkunkThreshold: 61,
  },
  {
    id: 'half',
    label: 'Half Game',
    description: '61 points',
    pointsToWin: 61,
    skunkThreshold: 31,
    doubleSkunkThreshold: 15,
  },
  {
    id: 'super_quick',
    label: 'Super Quick',
    description: '45 points',
    pointsToWin: 45,
    skunkThreshold: 30,
    doubleSkunkThreshold: null, // No double skunk
  },
  {
    id: 'sprint',
    label: 'Sprint',
    description: '31 points, no skunks',
    pointsToWin: 31,
    skunkThreshold: 0, // No skunks (forces skunks off)
    doubleSkunkThreshold: null,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Enter your target',
    pointsToWin: null, // User enters value
    skunkThreshold: 0, // Skunks disabled for custom
    doubleSkunkThreshold: null,
  },
];

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
