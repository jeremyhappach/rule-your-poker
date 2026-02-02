// Cribbage game orchestration logic

import type { 
  CribbageState, 
  CribbageCard, 
  CribbagePlayerState,
  CribbagePhase 
} from './cribbageTypes';
import { 
  CRIBBAGE_WINNING_SCORE, 
  SKUNK_THRESHOLD, 
  DOUBLE_SKUNK_THRESHOLD,
  CARDS_PER_PLAYER,
  DISCARD_COUNT 
} from './cribbageTypes';
import { evaluateHand, evaluatePegging, checkHisHeels, getCardPointValue, hasPlayableCard } from './cribbageScoring';
import type { PeggingPoints } from './cribbageTypes';
import { generateUUID } from '@/lib/uuid';

/**
 * Create a standard 52-card deck
 */
export function createDeck(): CribbageCard[] {
  const suits: CribbageCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  const deck: CribbageCard[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        suit,
        rank,
        value: rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10),
      });
    }
  }
  
  return deck;
}

/**
 * Shuffle a deck using Fisher-Yates algorithm
 */
export function shuffleDeck(deck: CribbageCard[]): CribbageCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Initialize a new cribbage game state
 */
export function initializeCribbageGame(
  playerIds: string[],
  dealerPlayerId: string,
  anteAmount: number
): CribbageState {
  const playerCount = playerIds.length;
  const cardsPerPlayer = CARDS_PER_PLAYER[playerCount] || 6;
  
  // Create and shuffle deck
  const deck = shuffleDeck(createDeck());
  
  // Deal cards
  const playerStates: Record<string, CribbagePlayerState> = {};
  let cardIndex = 0;
  
  for (const playerId of playerIds) {
    const hand = deck.slice(cardIndex, cardIndex + cardsPerPlayer);
    cardIndex += cardsPerPlayer;
    
    playerStates[playerId] = {
      playerId,
      hand,
      pegScore: 0,
      hasCalledGo: false,
      discardedToCrib: [],
    };
  }
  
  // Determine turn order (non-dealer plays first during pegging)
  const dealerIndex = playerIds.indexOf(dealerPlayerId);
  const turnOrder = [
    ...playerIds.slice(dealerIndex + 1),
    ...playerIds.slice(0, dealerIndex + 1),
  ];
  
  return {
    phase: 'discarding',
    dealerPlayerId,
    cribOwnerPlayerId: dealerPlayerId,
    playerStates,
    turnOrder,
    crib: [],
    cutCard: null,
    pegging: {
      playedCards: [],
      currentCount: 0,
      currentTurnPlayerId: turnOrder[0],
      lastToPlay: null,
      goCalledBy: [],
    },
    anteAmount,
    pot: anteAmount * playerIds.length,
    lastEvent: null,
    lastHandCount: null,
    winnerPlayerId: null,
    loserScore: null,
    payoutMultiplier: 1,
  };
}

function describePeggingPoints(points: PeggingPoints): string {
  const parts: string[] = [];
  if (points.thirtyOne) parts.push('31');
  if (points.fifteen) parts.push('15');
  if (points.pair > 0) parts.push('Pair');
  if (points.run > 0) parts.push(`Run ${points.run}`);
  if (points.lastCard) parts.push('Last');
  return parts.length ? parts.join(' + ') : 'Points';
}

function clearGoFlags(state: CribbageState): Record<string, CribbagePlayerState> {
  const newPlayerStates = { ...state.playerStates };
  for (const playerId of Object.keys(newPlayerStates)) {
    newPlayerStates[playerId] = {
      ...newPlayerStates[playerId],
      hasCalledGo: false,
    };
  }
  return newPlayerStates;
}

function findNextPlayerWithCards(state: CribbageState, preferredLeaderId: string | null): string | null {
  const order = state.turnOrder;
  if (!order.length) return null;
  const startIndex = preferredLeaderId ? Math.max(0, order.indexOf(preferredLeaderId)) : 0;
  for (let i = 0; i < order.length; i++) {
    const idx = (startIndex + i) % order.length;
    const id = order[idx];
    if (state.playerStates[id]?.hand.length > 0) return id;
  }
  return null;
}

function beginNewPeggingRun(state: CribbageState, preferredLeaderId: string | null): CribbageState {
  const leaderId = findNextPlayerWithCards(state, preferredLeaderId);
  return {
    ...state,
    playerStates: clearGoFlags(state),
    pegging: {
      ...state.pegging,
      currentCount: 0,
      goCalledBy: [],
      currentTurnPlayerId: leaderId,
      lastToPlay: null,
    },
  };
}

/**
 * Process a player's discard to crib
 */
export function discardToCrib(
  state: CribbageState,
  playerId: string,
  cardIndices: number[]
): CribbageState {
  if (state.phase !== 'discarding') {
    throw new Error('Not in discarding phase');
  }
  
  const playerState = state.playerStates[playerId];
  if (!playerState) {
    throw new Error('Player not found');
  }
  
  const expectedDiscard = DISCARD_COUNT[Object.keys(state.playerStates).length] || 2;
  if (cardIndices.length !== expectedDiscard) {
    throw new Error(`Must discard exactly ${expectedDiscard} cards`);
  }
  
  // Remove cards from hand and add to crib
  const discardedCards = cardIndices.map(i => playerState.hand[i]);
  const remainingHand = playerState.hand.filter((_, i) => !cardIndices.includes(i));
  
  const newState: CribbageState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...playerState,
        hand: remainingHand,
        discardedToCrib: discardedCards,
      },
    },
    crib: [...state.crib, ...discardedCards],
  };
  
  // Check if all players have discarded
  const allDiscarded = Object.values(newState.playerStates).every(
    ps => ps.discardedToCrib.length === expectedDiscard
  );
  
  if (allDiscarded) {
    return advanceToCutting(newState);
  }
  
  return newState;
}

/**
 * Advance to cutting phase and reveal cut card
 */
function advanceToCutting(state: CribbageState): CribbageState {
  // Get a card that hasn't been dealt
  const usedCards = new Set<string>();
  for (const ps of Object.values(state.playerStates)) {
    for (const card of [...ps.hand, ...ps.discardedToCrib]) {
      usedCards.add(`${card.rank}-${card.suit}`);
    }
  }
  
  const deck = createDeck().filter(
    c => !usedCards.has(`${c.rank}-${c.suit}`)
  );
  const cutCard = deck[Math.floor(Math.random() * deck.length)];
  
  let newState: CribbageState = {
    ...state,
    phase: 'cutting',
    cutCard,
  };
  
  // Check for "His Heels" (cut card is Jack = 2 points to dealer)
  if (checkHisHeels(cutCard)) {
    const dealerState = newState.playerStates[newState.dealerPlayerId];
    const newScore = dealerState.pegScore + 2;
    
    newState = {
      ...newState,
      playerStates: {
        ...newState.playerStates,
        [newState.dealerPlayerId]: {
          ...dealerState,
          pegScore: newScore,
        },
      },
      lastEvent: {
        id: generateUUID(),
        type: 'his_heels',
        playerId: newState.dealerPlayerId,
        points: 2,
        label: 'His Heels',
        createdAt: new Date().toISOString(),
      },
    };
    
    // Check for win
    if (newScore >= CRIBBAGE_WINNING_SCORE) {
      return endGame(newState, newState.dealerPlayerId);
    }
  }
  
  // Immediately advance to pegging
  return advanceToPegging(newState);
}

/**
 * Advance to pegging phase
 */
function advanceToPegging(state: CribbageState): CribbageState {
  return {
    ...state,
    phase: 'pegging',
    pegging: {
      ...state.pegging,
      currentTurnPlayerId: state.turnOrder[0],
    },
  };
}

/**
 * Play a card during pegging
 */
export function playPeggingCard(
  state: CribbageState,
  playerId: string,
  cardIndex: number
): CribbageState {
  if (state.phase !== 'pegging') {
    throw new Error('Not in pegging phase');
  }
  
  if (state.pegging.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }
  
  const playerState = state.playerStates[playerId];
  const card = playerState.hand[cardIndex];
  
  if (!card) {
    throw new Error('Invalid card index');
  }
  
  const newCount = state.pegging.currentCount + getCardPointValue(card);
  if (newCount > 31) {
    throw new Error('Card would exceed 31');
  }
  
  // Remove card from hand
  const newHand = playerState.hand.filter((_, i) => i !== cardIndex);
  
  // Add to played cards
  const newPlayedCards = [...state.pegging.playedCards, { playerId, card }];
  
  // True last card of the entire pegging (end of hand)
  const isLastCardOfHand = Object.values(state.playerStates).every(
    ps => ps.playerId === playerId ? newHand.length === 0 : ps.hand.length === 0
  );

  const peggingPoints = evaluatePegging(state.pegging.playedCards, card, state.pegging.currentCount, isLastCardOfHand);
  const pointsEarned = peggingPoints.total;
  
  // Update player score
  const newScore = playerState.pegScore + pointsEarned;
  
  let newState: CribbageState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...playerState,
        hand: newHand,
        pegScore: newScore,
        hasCalledGo: false,
      },
    },
    pegging: {
      ...state.pegging,
      playedCards: newPlayedCards,
      currentCount: newCount,
      lastToPlay: playerId,
      goCalledBy: newCount === 31 ? [] : state.pegging.goCalledBy, // reset on 31
    },
    lastEvent: pointsEarned > 0 ? {
      id: generateUUID(),
      type: 'pegging_points',
      playerId,
      points: pointsEarned,
      label: describePeggingPoints(peggingPoints),
      createdAt: new Date().toISOString(),
      count: newCount,
    } : state.lastEvent ?? null,
  };
  
  // Check for win
  if (newScore >= CRIBBAGE_WINNING_SCORE) {
    return endGame(newState, playerId);
  }
  
  // If pegging is complete, immediately count hands
  const allCardsPlayedAfter = Object.values(newState.playerStates).every(ps => ps.hand.length === 0);
  if (allCardsPlayedAfter) {
    return advanceToCounting(newState);
  }

  // 31 ends the run; the player who hit 31 leads the next run
  if (newCount === 31) {
    return beginNewPeggingRun(newState, playerId);
  }

  return advanceToNextPeggingTurn(newState);
}

/**
 * Call "go" when can't play
 */
export function callGo(state: CribbageState, playerId: string): CribbageState {
  if (state.phase !== 'pegging') {
    throw new Error('Not in pegging phase');
  }
  
  if (state.pegging.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }
  
  const playerState = state.playerStates[playerId];
  
  // Verify player can't actually play
  if (hasPlayableCard(playerState.hand, state.pegging.currentCount)) {
    throw new Error('You have a playable card');
  }
  
  const newGoCalledBy = [...state.pegging.goCalledBy, playerId];
  
  let newState: CribbageState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...playerState,
        hasCalledGo: true,
      },
    },
    pegging: {
      ...state.pegging,
      goCalledBy: newGoCalledBy,
    },
  };
  
  // Check if all players have called go
  const activePlayers = Object.values(newState.playerStates).filter(ps => ps.hand.length > 0);
  const allCalledGo = activePlayers.every(ps => newGoCalledBy.includes(ps.playerId));
  
  if (allCalledGo && state.pegging.lastToPlay) {
    // Award "go" point to last player who played
    const lastPlayer = newState.playerStates[state.pegging.lastToPlay];
    const newScore = lastPlayer.pegScore + 1;
    
    newState = {
      ...newState,
      playerStates: {
        ...newState.playerStates,
        [state.pegging.lastToPlay]: {
          ...lastPlayer,
          pegScore: newScore,
        },
      },
    };
    
    // Check for win
    if (newScore >= CRIBBAGE_WINNING_SCORE) {
      return endGame(newState, state.pegging.lastToPlay);
    }

    // Reset count; the last player to play leads the next run
    newState = {
      ...newState,
      lastEvent: {
        id: generateUUID(),
        type: 'go_point',
        playerId: state.pegging.lastToPlay,
        points: 1,
        label: 'Go',
        createdAt: new Date().toISOString(),
        count: state.pegging.currentCount,
      },
    };

    const allCardsPlayedAfter = Object.values(newState.playerStates).every(ps => ps.hand.length === 0);
    if (allCardsPlayedAfter) {
      return advanceToCounting(newState);
    }

    return beginNewPeggingRun(newState, state.pegging.lastToPlay);
  }
  
  return advanceToNextPeggingTurn(newState);
}

/**
 * Reset pegging count to 0
 */
function resetPeggingCount(state: CribbageState): CribbageState {
  // Reset go flags for all players with cards
  const newPlayerStates = { ...state.playerStates };
  for (const playerId of Object.keys(newPlayerStates)) {
    newPlayerStates[playerId] = {
      ...newPlayerStates[playerId],
      hasCalledGo: false,
    };
  }
  
  return {
    ...state,
    playerStates: newPlayerStates,
    pegging: {
      ...state.pegging,
      currentCount: 0,
      goCalledBy: [],
    },
  };
}

/**
 * Advance to next player's turn during pegging
 */
function advanceToNextPeggingTurn(state: CribbageState): CribbageState {
  // Check if all cards have been played
  const allCardsPlayed = Object.values(state.playerStates).every(ps => ps.hand.length === 0);
  
  if (allCardsPlayed) {
    return advanceToCounting(state);
  }
  
  // Find next player who can play or hasn't called go
  const currentId = state.pegging.currentTurnPlayerId;
  const currentIndex = currentId ? state.turnOrder.indexOf(currentId) : -1;
  
  for (let i = 1; i <= state.turnOrder.length; i++) {
    const nextIndex = (currentIndex + i) % state.turnOrder.length;
    const nextPlayerId = state.turnOrder[nextIndex];
    const nextPlayer = state.playerStates[nextPlayerId];
    
    if (nextPlayer.hand.length > 0 && !state.pegging.goCalledBy.includes(nextPlayerId)) {
      return {
        ...state,
        pegging: {
          ...state.pegging,
          currentTurnPlayerId: nextPlayerId,
        },
      };
    }
  }
  
  // If everyone with cards has called go, reset and find someone with cards
  const resetState = beginNewPeggingRun(state, state.pegging.lastToPlay);
  if (resetState.pegging.currentTurnPlayerId) {
    return resetState;
  }
  
  // All cards played - advance to counting
  return advanceToCounting(state);
}

/**
 * Advance to counting phase
 */
function advanceToCounting(state: CribbageState): CribbageState {
  // Score each player's hand, then the crib
  // Order: non-dealer first, then dealer, then crib
  let newState = { ...state, phase: 'counting' as CribbagePhase };

  const playerHandScores: Record<string, ReturnType<typeof evaluateHand>> = {};
  
  // Get the hands that were discarded (4 cards each after discarding)
  for (const playerId of state.turnOrder) {
    if (playerId === state.dealerPlayerId) continue; // Dealer scores last
    
    const ps = state.playerStates[playerId];
    // The hand for scoring is the 4 cards remaining after discarding
    const scoringHand = ps.hand.length === 0 
      ? state.pegging.playedCards
          .filter(pc => pc.playerId === playerId)
          .map(pc => pc.card)
      : ps.hand;
    
    // Get original hand from played cards (during counting, hands are empty)
    const originalHand = state.pegging.playedCards
      .filter(pc => pc.playerId === playerId)
      .map(pc => pc.card);
    
    const handScore = evaluateHand(originalHand, state.cutCard, false);
    playerHandScores[playerId] = handScore;
    const newScore = ps.pegScore + handScore.total;
    
    newState = {
      ...newState,
      playerStates: {
        ...newState.playerStates,
        [playerId]: {
          ...newState.playerStates[playerId],
          pegScore: newScore,
        },
      },
    };
    
    if (newScore >= CRIBBAGE_WINNING_SCORE) {
      return endGame(newState, playerId);
    }
  }
  
  // Score dealer's hand
  const dealerHand = state.pegging.playedCards
    .filter(pc => pc.playerId === state.dealerPlayerId)
    .map(pc => pc.card);
  
  const dealerHandScore = evaluateHand(dealerHand, state.cutCard, false);
  playerHandScores[state.dealerPlayerId] = dealerHandScore;
  const dealerPs = newState.playerStates[state.dealerPlayerId];
  let dealerNewScore = dealerPs.pegScore + dealerHandScore.total;
  
  newState = {
    ...newState,
    playerStates: {
      ...newState.playerStates,
      [state.dealerPlayerId]: {
        ...dealerPs,
        pegScore: dealerNewScore,
      },
    },
  };
  
  if (dealerNewScore >= CRIBBAGE_WINNING_SCORE) {
    return endGame(newState, state.dealerPlayerId);
  }
  
  // Score crib
  const cribScore = evaluateHand(state.crib, state.cutCard, true);
  dealerNewScore = newState.playerStates[state.dealerPlayerId].pegScore + cribScore.total;
  
  newState = {
    ...newState,
    playerStates: {
      ...newState.playerStates,
      [state.dealerPlayerId]: {
        ...newState.playerStates[state.dealerPlayerId],
        pegScore: dealerNewScore,
      },
    },
  };
  
  if (dealerNewScore >= CRIBBAGE_WINNING_SCORE) {
    return endGame(newState, state.dealerPlayerId);
  }
  
  // Store counting summary for UI
  newState = {
    ...newState,
    lastHandCount: {
      countedAt: new Date().toISOString(),
      playerHandScores,
      dealerHandScore,
      cribScore,
    },
    lastEvent: {
      id: generateUUID(),
      type: 'hand_count',
      playerId: state.dealerPlayerId,
      points: 0,
      label: 'Hands counted',
      createdAt: new Date().toISOString(),
    },
  };

  // Keep the table in counting so the UI can show scoring breakdown.
  return newState;
}

/**
 * End the game with a winner
 */
function endGame(state: CribbageState, winnerPlayerId: string): CribbageState {
  // Find loser with lowest score for skunk calculation
  let lowestScore = CRIBBAGE_WINNING_SCORE;
  for (const ps of Object.values(state.playerStates)) {
    if (ps.playerId !== winnerPlayerId && ps.pegScore < lowestScore) {
      lowestScore = ps.pegScore;
    }
  }
  
  // Calculate payout multiplier
  let multiplier = 1;
  if (lowestScore < DOUBLE_SKUNK_THRESHOLD) {
    multiplier = 3; // Double skunk
  } else if (lowestScore < SKUNK_THRESHOLD) {
    multiplier = 2; // Skunk
  }
  
  return {
    ...state,
    phase: 'complete',
    winnerPlayerId,
    loserScore: lowestScore,
    payoutMultiplier: multiplier,
  };
}

/**
 * Get display name for a phase
 */
export function getPhaseDisplayName(phase: CribbagePhase): string {
  switch (phase) {
    case 'dealing': return 'Dealing';
    case 'discarding': return 'Discard to Crib';
    case 'cutting': return 'Cut Card';
    case 'pegging': return 'Pegging';
    case 'counting': return 'Counting Hands';
    case 'complete': return 'Complete';
    default: return phase;
  }
}
