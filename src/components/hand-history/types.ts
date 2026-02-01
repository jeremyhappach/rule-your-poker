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
}

export interface CardData {
  rank: string;
  suit: string;
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
}

export interface PlayerDiceResult {
  playerId: string;
  username: string;
  dice: number[];
  isWinner: boolean;
  handDescription?: string;
  rollCount?: number;
}
