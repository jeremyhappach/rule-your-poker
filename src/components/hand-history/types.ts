// Core types for Hand History display

export interface GameResultRecord {
  id: string;
  game_id: string;
  hand_number: number;
  winner_player_id: string | null;
  winner_username: string | null;
  winning_hand_description: string | null;
  pot_won: number;
  player_chip_changes: Record<string, number>;
  is_chopped: boolean;
  created_at: string;
  dealer_game_id?: string | null;
  game_type?: string | null;
}

export interface DealerGameRecord {
  id: string;
  game_type: string;
  dealer_user_id: string;
  started_at: string;
  config: Record<string, any>;
  dealer_username?: string;
}

export interface RoundRecord {
  id: string;
  game_id: string;
  round_number: number;
  hand_number: number | null;
  pot: number | null;
  status: string;
  created_at: string;
  horses_state?: any;
  dealer_game_id?: string | null;
  community_cards?: any;
  chucky_cards?: any;
}

export interface PlayerCardRecord {
  roundId: string;
  playerId: string;
  cards: CardData[];
  visibleToUserIds: string[] | null;
  isPublic?: boolean;
}

export interface CardData {
  rank: string;
  suit: string;
}

// Player action (stay/fold decision) - public info
export interface PlayerActionRecord {
  playerId: string;
  actionType: 'stay' | 'fold';
  createdAt: string;
}

// Grouped data structures for display
export interface RoundGroup {
  roundNumber: number;
  roundId: string;
  myCards: CardData[];
  visiblePlayerCards: Array<{
    playerId: string;
    username: string;
    cards: CardData[];
    isCurrentPlayer: boolean;
  }>;
  communityCards: CardData[];
  chuckyCards: CardData[];
  events: GameResultRecord[];
  diceResults?: PlayerDiceResult[];
  cribbageEvents?: CribbageEventRecord[];
  cribbagePointsToWin?: number;
  // Stay/fold decisions - public info visible to all
  playerDecisions?: PlayerActionRecord[];
}

export interface HandGroup {
  handNumber: number;
  rounds: RoundGroup[];
  totalChipChange: number;
}

export interface DealerGameGroup {
  dealerGameId: string;
  displayNumber: number;
  gameType: string | null;
  dealerGame?: DealerGameRecord;
  hands: HandGroup[];
  totalChipChange: number;
  winner: string | null;
  winnerDescription: string | null;
  isWinner: boolean;
  totalPot: number;
  latestTimestamp: string;
  // For dice games
  isDiceGame: boolean;

  // Cribbage summary (optional)
  cribbageFinalScores?: Record<string, number> | null;
  cribbageSkunkLevel?: 0 | 1 | 2 | null;
}

export interface PlayerDiceResult {
  playerId: string;
  username: string;
  dice: number[];
  isWinner: boolean;
  handDescription?: string;
  rollCount?: number;
}

// Cribbage event types
export interface CribbageEventRecord {
  id: string;
  round_id: string;
  dealer_game_id: string | null;
  hand_number: number;
  player_id: string;
  event_type: string;
  event_subtype: string | null;
  card_played: CardData | null;
  cards_involved: CardData[];
  cards_on_table: CardData[] | null;
  running_count: number | null;
  points: number;
  scores_after: Record<string, number>;
  sequence_number: number;
  created_at: string;
}
