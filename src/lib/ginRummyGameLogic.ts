// Gin Rummy core game logic
// Handles dealing, first-draw phase, draw/discard turns, knock/gin, and state transitions.
// All state mutations return a new GinRummyState (immutable pattern).

import {
  GinRummyCard,
  GinRummyState,
  GinRummyPlayerState,
  GinRummyPhase,
  GinRummyAction,
  KnockResult,
  CARDS_PER_PLAYER,
  KNOCK_DEADWOOD_LIMIT,
  STOCK_EXHAUSTION_THRESHOLD,
} from './ginRummyTypes';
import {
  createGinRummyDeck,
  shuffleDeck,
  findOptimalMelds,
  scoreKnock,
  sumDeadwood,
  canDrawFromStock,
} from './ginRummyScoring';

// ─── State Factory ──────────────────────────────────────────────

/** Create the initial Gin Rummy state for a new hand */
export function createInitialGinRummyState(
  dealerPlayerId: string,
  nonDealerPlayerId: string,
  anteAmount: number,
  pointsToWin: number,
  existingMatchScores?: Record<string, number>
): GinRummyState {
  return {
    phase: 'dealing',
    dealerPlayerId,
    nonDealerPlayerId,
    playerStates: {
      [dealerPlayerId]: createPlayerState(dealerPlayerId),
      [nonDealerPlayerId]: createPlayerState(nonDealerPlayerId),
    },
    turnOrder: [nonDealerPlayerId, dealerPlayerId],
    stockPile: [],
    discardPile: [],
    currentTurnPlayerId: nonDealerPlayerId, // Non-dealer acts first
    turnPhase: 'draw',
    drawSource: null,
    firstDrawOfferedTo: null,
    firstDrawPassed: [],
    anteAmount,
    pot: 0,
    pointsToWin,
    matchScores: existingMatchScores ?? {
      [dealerPlayerId]: 0,
      [nonDealerPlayerId]: 0,
    },
    knockResult: null,
    lastAction: null,
    winnerPlayerId: null,
  };
}

function createPlayerState(playerId: string): GinRummyPlayerState {
  return {
    playerId,
    hand: [],
    melds: [],
    deadwood: [],
    deadwoodValue: 0,
    hasKnocked: false,
    hasGin: false,
    laidOffCards: [],
  };
}

// ─── Deal ───────────────────────────────────────────────────────

/** Deal 10 cards to each player, place one face-up on discard pile, rest is stock */
export function dealHand(state: GinRummyState): GinRummyState {
  const deck = shuffleDeck(createGinRummyDeck());
  const nonDealerHand = deck.slice(0, CARDS_PER_PLAYER);
  const dealerHand = deck.slice(CARDS_PER_PLAYER, CARDS_PER_PLAYER * 2);
  const upCard = deck[CARDS_PER_PLAYER * 2]; // First discard pile card
  const stockPile = deck.slice(CARDS_PER_PLAYER * 2 + 1); // Remaining cards

  const { dealerPlayerId, nonDealerPlayerId } = state;

  return {
    ...state,
    phase: 'first_draw',
    playerStates: {
      [dealerPlayerId]: {
        ...state.playerStates[dealerPlayerId],
        hand: dealerHand,
      },
      [nonDealerPlayerId]: {
        ...state.playerStates[nonDealerPlayerId],
        hand: nonDealerHand,
      },
    },
    stockPile,
    discardPile: [upCard],
    currentTurnPlayerId: nonDealerPlayerId,
    turnPhase: 'draw',
    drawSource: null,
    firstDrawOfferedTo: nonDealerPlayerId,
    firstDrawPassed: [],
  };
}

// ─── First Draw Phase ───────────────────────────────────────────
// Non-dealer may take the face-up card or pass.
// If non-dealer passes, dealer may take it or pass.
// If both pass, non-dealer draws from stock and normal play begins.

/** Handle a player taking the up-card during first draw */
export function takeFirstDrawCard(
  state: GinRummyState,
  playerId: string
): GinRummyState {
  if (state.phase !== 'first_draw') {
    throw new Error('Not in first_draw phase');
  }
  if (state.firstDrawOfferedTo !== playerId) {
    throw new Error('Not your turn to draw');
  }

  const upCard = state.discardPile[state.discardPile.length - 1];
  const newDiscard = state.discardPile.slice(0, -1);
  const newHand = [...state.playerStates[playerId].hand, upCard];

  // Player now has 11 cards and must discard
  return {
    ...state,
    phase: 'playing',
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...state.playerStates[playerId],
        hand: newHand,
      },
    },
    discardPile: newDiscard,
    currentTurnPlayerId: playerId,
    turnPhase: 'discard', // They drew, now must discard
    drawSource: 'discard',
    firstDrawOfferedTo: null,
    firstDrawPassed: [],
    lastAction: {
      type: 'draw_discard',
      playerId,
      card: upCard,
      timestamp: new Date().toISOString(),
    },
  };
}

/** Handle a player passing on the up-card during first draw */
export function passFirstDraw(
  state: GinRummyState,
  playerId: string
): GinRummyState {
  if (state.phase !== 'first_draw') {
    throw new Error('Not in first_draw phase');
  }
  if (state.firstDrawOfferedTo !== playerId) {
    throw new Error('Not your turn');
  }

  const newPassed = [...state.firstDrawPassed, playerId];

  // If non-dealer passed, offer to dealer
  if (newPassed.length === 1) {
    return {
      ...state,
      firstDrawOfferedTo: state.dealerPlayerId,
      firstDrawPassed: newPassed,
      lastAction: {
        type: 'pass_first_draw',
        playerId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Both passed — non-dealer draws from stock, normal play begins
  const topStock = state.stockPile[state.stockPile.length - 1];
  const newStock = state.stockPile.slice(0, -1);
  const nonDealer = state.nonDealerPlayerId;
  const newHand = [...state.playerStates[nonDealer].hand, topStock];

  return {
    ...state,
    phase: 'playing',
    playerStates: {
      ...state.playerStates,
      [nonDealer]: {
        ...state.playerStates[nonDealer],
        hand: newHand,
      },
    },
    stockPile: newStock,
    currentTurnPlayerId: nonDealer,
    turnPhase: 'discard', // They drew from stock, now must discard
    drawSource: 'stock',
    firstDrawOfferedTo: null,
    firstDrawPassed: [],
    lastAction: {
      type: 'draw_stock',
      playerId: nonDealer,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Draw Actions ───────────────────────────────────────────────

/** Draw from the stock pile */
export function drawFromStock(
  state: GinRummyState,
  playerId: string
): GinRummyState {
  validateDrawAction(state, playerId);

  if (!canDrawFromStock(state.stockPile)) {
    throw new Error('Stock pile exhausted — hand is void');
  }

  const topCard = state.stockPile[state.stockPile.length - 1];
  const newStock = state.stockPile.slice(0, -1);
  const newHand = [...state.playerStates[playerId].hand, topCard];

  return {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...state.playerStates[playerId],
        hand: newHand,
      },
    },
    stockPile: newStock,
    turnPhase: 'discard',
    drawSource: 'stock',
    lastAction: {
      type: 'draw_stock',
      playerId,
      timestamp: new Date().toISOString(),
    },
  };
}

/** Draw from the discard pile (take the top face-up card) */
export function drawFromDiscard(
  state: GinRummyState,
  playerId: string
): GinRummyState {
  validateDrawAction(state, playerId);

  if (state.discardPile.length === 0) {
    throw new Error('Discard pile is empty');
  }

  const topCard = state.discardPile[state.discardPile.length - 1];
  const newDiscard = state.discardPile.slice(0, -1);
  const newHand = [...state.playerStates[playerId].hand, topCard];

  return {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...state.playerStates[playerId],
        hand: newHand,
      },
    },
    discardPile: newDiscard,
    turnPhase: 'discard',
    drawSource: 'discard',
    lastAction: {
      type: 'draw_discard',
      playerId,
      card: topCard,
      timestamp: new Date().toISOString(),
    },
  };
}

function validateDrawAction(state: GinRummyState, playerId: string) {
  if (state.phase !== 'playing') {
    throw new Error(`Cannot draw in phase: ${state.phase}`);
  }
  if (state.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }
  if (state.turnPhase !== 'draw') {
    throw new Error('You must discard first');
  }
}

// ─── Discard Action ─────────────────────────────────────────────

/** Discard a card from hand, ending the turn (or triggering knock/gin) */
export function discardCard(
  state: GinRummyState,
  playerId: string,
  card: GinRummyCard
): GinRummyState {
  if (state.phase !== 'playing') {
    throw new Error(`Cannot discard in phase: ${state.phase}`);
  }
  if (state.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }
  if (state.turnPhase !== 'discard') {
    throw new Error('You must draw first');
  }

  const hand = state.playerStates[playerId].hand;
  const cardIdx = hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
  if (cardIdx === -1) {
    throw new Error('Card not in hand');
  }

  // Cannot discard the same card that was just drawn from discard pile
  if (
    state.drawSource === 'discard' &&
    state.lastAction?.card &&
    state.lastAction.card.rank === card.rank &&
    state.lastAction.card.suit === card.suit
  ) {
    throw new Error('Cannot discard the card you just drew from the discard pile');
  }

  const newHand = [...hand];
  newHand.splice(cardIdx, 1);
  const newDiscard = [...state.discardPile, card];

  // Switch to opponent's turn
  const opponentId = getOpponent(state, playerId);

  // Check for stock exhaustion after discard
  const isStockExhausted = state.stockPile.length <= STOCK_EXHAUSTION_THRESHOLD;

  const newState: GinRummyState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...state.playerStates[playerId],
        hand: newHand,
      },
    },
    discardPile: newDiscard,
    currentTurnPlayerId: opponentId,
    turnPhase: 'draw',
    drawSource: null,
    lastAction: {
      type: 'discard',
      playerId,
      card,
      timestamp: new Date().toISOString(),
    },
  };

  // If stock is exhausted, the hand is void (no winner)
  if (isStockExhausted) {
    return {
      ...newState,
      phase: 'complete',
      knockResult: null, // Void hand — no points awarded
    };
  }

  return newState;
}

// ─── Knock / Gin ────────────────────────────────────────────────

/**
 * Player declares a knock (or gin).
 * This is called INSTEAD of discardCard when the player wants to knock.
 * The player discards one card and then reveals their melds.
 */
export function declareKnock(
  state: GinRummyState,
  playerId: string,
  discardCardData: GinRummyCard
): GinRummyState {
  if (state.phase !== 'playing') {
    throw new Error(`Cannot knock in phase: ${state.phase}`);
  }
  if (state.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }
  if (state.turnPhase !== 'discard') {
    throw new Error('You must draw first');
  }

  const hand = state.playerStates[playerId].hand;
  const cardIdx = hand.findIndex(
    c => c.rank === discardCardData.rank && c.suit === discardCardData.suit
  );
  if (cardIdx === -1) {
    throw new Error('Card not in hand');
  }

  // Build the hand after discarding
  const knockHand = [...hand];
  knockHand.splice(cardIdx, 1);

  // Validate deadwood
  const grouping = findOptimalMelds(knockHand);
  const isGin = grouping.deadwoodValue === 0;

  if (grouping.deadwoodValue > KNOCK_DEADWOOD_LIMIT && !isGin) {
    throw new Error(`Deadwood (${grouping.deadwoodValue}) exceeds knock limit of ${KNOCK_DEADWOOD_LIMIT}`);
  }

  const newDiscard = [...state.discardPile, discardCardData];

  const newPlayerState: GinRummyPlayerState = {
    ...state.playerStates[playerId],
    hand: knockHand,
    melds: grouping.melds,
    deadwood: grouping.deadwood,
    deadwoodValue: grouping.deadwoodValue,
    hasKnocked: true,
    hasGin: isGin,
  };

  // If gin, skip laying off — go straight to scoring
  const nextPhase: GinRummyPhase = isGin ? 'scoring' : 'knocking';
  const opponentIdForLayOff = getOpponent(state, playerId);

  return {
    ...state,
    phase: nextPhase,
    // Set turn to opponent for laying off (or irrelevant if gin → scoring)
    currentTurnPlayerId: isGin ? playerId : opponentIdForLayOff,
    playerStates: {
      ...state.playerStates,
      [playerId]: newPlayerState,
    },
    discardPile: newDiscard,
    lastAction: {
      type: isGin ? 'gin' : 'knock',
      playerId,
      card: discardCardData,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Laying Off ─────────────────────────────────────────────────

/** Opponent lays off a card on the knocker's melds */
export function layOffCard(
  state: GinRummyState,
  playerId: string,
  card: GinRummyCard,
  onMeldIndex: number
): GinRummyState {
  if (state.phase !== 'knocking' && state.phase !== 'laying_off') {
    throw new Error('Not in laying off phase');
  }

  const knockerId = getKnocker(state);
  if (playerId === knockerId) {
    throw new Error('Knocker cannot lay off cards');
  }

  const hand = state.playerStates[playerId].hand;
  const cardIdx = hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
  if (cardIdx === -1) {
    throw new Error('Card not in hand');
  }

  // Add card to knocker's meld (for lay-off tracking)
  const knockerMelds = [...state.playerStates[knockerId].melds];
  const targetMeld = { ...knockerMelds[onMeldIndex] };
  targetMeld.cards = [...targetMeld.cards, card];
  knockerMelds[onMeldIndex] = targetMeld;

  const newHand = [...hand];
  newHand.splice(cardIdx, 1);

  return {
    ...state,
    phase: 'laying_off',
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...state.playerStates[playerId],
        hand: newHand,
        laidOffCards: [...state.playerStates[playerId].laidOffCards, card],
      },
      [knockerId]: {
        ...state.playerStates[knockerId],
        melds: knockerMelds,
      },
    },
    lastAction: {
      type: 'lay_off',
      playerId,
      card,
      timestamp: new Date().toISOString(),
    },
  };
}

/** Opponent declines to lay off more cards — proceed to scoring */
export function finishLayingOff(
  state: GinRummyState,
  playerId: string
): GinRummyState {
  if (state.phase !== 'knocking' && state.phase !== 'laying_off') {
    throw new Error('Not in laying off phase');
  }

  return {
    ...state,
    phase: 'scoring',
    lastAction: {
      type: 'decline_lay_off',
      playerId,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Scoring ────────────────────────────────────────────────────

/** Calculate final scores for a completed hand */
export function scoreHand(state: GinRummyState): GinRummyState {
  if (state.phase !== 'scoring') {
    throw new Error('Not in scoring phase');
  }

  const knockerId = getKnocker(state);
  const opponentId = getOpponent(state, knockerId);
  const knockerState = state.playerStates[knockerId];
  const opponentState = state.playerStates[opponentId];

  const result = scoreKnock(
    knockerId,
    opponentId,
    knockerState.hand,
    opponentState.hand,
    opponentState.laidOffCards,
    knockerState.hasGin
  );

  // Update match scores
  const newMatchScores = { ...state.matchScores };
  newMatchScores[result.winnerId] = (newMatchScores[result.winnerId] || 0) + result.pointsAwarded;

  // Check if anyone has won the match
  const matchWinner = newMatchScores[result.winnerId] >= state.pointsToWin
    ? result.winnerId
    : null;

  // Populate opponent's melds/deadwood for display
  const opponentGrouping = findOptimalMelds(
    opponentState.hand.filter(
      c => !opponentState.laidOffCards.some(lc => lc.rank === c.rank && lc.suit === c.suit)
    )
  );

  return {
    ...state,
    phase: 'complete',
    knockResult: result,
    matchScores: newMatchScores,
    winnerPlayerId: matchWinner,
    playerStates: {
      ...state.playerStates,
      [opponentId]: {
        ...state.playerStates[opponentId],
        melds: opponentGrouping.melds,
        deadwood: opponentGrouping.deadwood,
        deadwoodValue: opponentGrouping.deadwoodValue,
      },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function getOpponent(state: GinRummyState, playerId: string): string {
  return playerId === state.dealerPlayerId
    ? state.nonDealerPlayerId
    : state.dealerPlayerId;
}

function getKnocker(state: GinRummyState): string {
  for (const [id, ps] of Object.entries(state.playerStates)) {
    if (ps.hasKnocked || ps.hasGin) return id;
  }
  throw new Error('No player has knocked');
}

/** Check if stock pile is exhausted (hand should be voided) */
export function isStockExhausted(state: GinRummyState): boolean {
  return state.stockPile.length <= STOCK_EXHAUSTION_THRESHOLD;
}

/** Get the number of cards remaining in the stock */
export function stockRemaining(state: GinRummyState): number {
  return state.stockPile.length;
}

/** Get the top card of the discard pile (visible to both players) */
export function getDiscardTop(state: GinRummyState): GinRummyCard | null {
  return state.discardPile.length > 0
    ? state.discardPile[state.discardPile.length - 1]
    : null;
}

/** Determine who deals next hand (loser of current hand, or non-dealer if void) */
export function getNextDealer(state: GinRummyState): string {
  if (!state.knockResult) {
    // Void hand — dealer rotates
    return state.nonDealerPlayerId;
  }
  // Loser deals next
  return state.knockResult.winnerId === state.dealerPlayerId
    ? state.nonDealerPlayerId
    : state.dealerPlayerId;
}
