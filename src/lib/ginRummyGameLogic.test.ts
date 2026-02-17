import { describe, it, expect } from 'vitest';
import {
  createInitialGinRummyState,
  dealHand,
  takeFirstDrawCard,
  passFirstDraw,
  drawFromStock,
  drawFromDiscard,
  discardCard,
  declareKnock,
  layOffCard,
  finishLayingOff,
  scoreHand,
  getNextDealer,
  getDiscardTop,
} from './ginRummyGameLogic';

describe('Gin Rummy Game Logic', () => {
  const P1 = 'player-1';
  const P2 = 'player-2';

  function freshState() {
    return createInitialGinRummyState(P1, P2, 5, 100);
  }

  function dealtState() {
    return dealHand(freshState());
  }

  describe('createInitialGinRummyState', () => {
    it('initializes correctly', () => {
      const state = freshState();
      expect(state.phase).toBe('dealing');
      expect(state.dealerPlayerId).toBe(P1);
      expect(state.nonDealerPlayerId).toBe(P2);
      expect(state.turnOrder).toEqual([P2, P1]);
      expect(state.currentTurnPlayerId).toBe(P2);
    });
  });

  describe('dealHand', () => {
    it('deals 10 cards to each player, 1 upcard, rest as stock', () => {
      const state = dealtState();
      expect(state.phase).toBe('first_draw');
      expect(state.playerStates[P1].hand.length).toBe(10);
      expect(state.playerStates[P2].hand.length).toBe(10);
      expect(state.discardPile.length).toBe(1);
      expect(state.stockPile.length).toBe(31); // 52 - 20 - 1
      expect(state.firstDrawOfferedTo).toBe(P2); // Non-dealer first
    });
  });

  describe('first draw phase', () => {
    it('non-dealer can take the up-card', () => {
      const state = dealtState();
      const upCard = getDiscardTop(state)!;
      const next = takeFirstDrawCard(state, P2);
      expect(next.phase).toBe('playing');
      expect(next.playerStates[P2].hand.length).toBe(11);
      expect(next.turnPhase).toBe('discard');
      expect(next.playerStates[P2].hand).toContainEqual(upCard);
    });

    it('non-dealer passes, then dealer can take', () => {
      let state = dealtState();
      state = passFirstDraw(state, P2);
      expect(state.firstDrawOfferedTo).toBe(P1);
      const upCard = getDiscardTop(state)!;
      const next = takeFirstDrawCard(state, P1);
      expect(next.phase).toBe('playing');
      expect(next.playerStates[P1].hand.length).toBe(11);
    });

    it('both pass → non-dealer draws from stock', () => {
      let state = dealtState();
      state = passFirstDraw(state, P2);
      state = passFirstDraw(state, P1);
      expect(state.phase).toBe('playing');
      expect(state.playerStates[P2].hand.length).toBe(11);
      expect(state.turnPhase).toBe('discard');
      expect(state.stockPile.length).toBe(30);
    });
  });

  describe('draw / discard loop', () => {
    function playingState() {
      let s = dealtState();
      s = passFirstDraw(s, P2);
      s = passFirstDraw(s, P1);
      // P2 has 11 cards, must discard
      return s;
    }

    it('discard reduces hand to 10 and switches turn', () => {
      let state = playingState();
      const card = state.playerStates[P2].hand[0];
      state = discardCard(state, P2, card);
      expect(state.playerStates[P2].hand.length).toBe(10);
      expect(state.currentTurnPlayerId).toBe(P1);
      expect(state.turnPhase).toBe('draw');
    });

    it('draw from stock gives 11 cards', () => {
      let state = playingState();
      const card = state.playerStates[P2].hand[0];
      state = discardCard(state, P2, card);
      // P1's turn to draw
      state = drawFromStock(state, P1);
      expect(state.playerStates[P1].hand.length).toBe(11);
      expect(state.turnPhase).toBe('discard');
    });

    it('draw from discard takes the top card', () => {
      let state = playingState();
      const card = state.playerStates[P2].hand[0];
      state = discardCard(state, P2, card);
      const topDiscard = getDiscardTop(state)!;
      state = drawFromDiscard(state, P1);
      expect(state.playerStates[P1].hand).toContainEqual(topDiscard);
    });

    it('throws if drawing out of turn', () => {
      const state = playingState();
      expect(() => drawFromStock(state, P1)).toThrow('Not your turn');
    });

    it('throws if discarding before drawing', () => {
      let state = playingState();
      const card = state.playerStates[P2].hand[0];
      state = discardCard(state, P2, card);
      // P1 must draw first
      const p1card = state.playerStates[P1].hand[0];
      expect(() => discardCard(state, P1, p1card)).toThrow('You must draw first');
    });
  });

  describe('knock / gin', () => {
    it('getNextDealer returns loser as next dealer', () => {
      const state = freshState();
      const withResult = {
        ...state,
        phase: 'complete' as const,
        knockResult: {
          knockerId: P2,
          opponentId: P1,
          knockerDeadwood: 5,
          opponentDeadwood: 20,
          isGin: false,
          isUndercut: false,
          pointsAwarded: 15,
          winnerId: P2,
        },
      };
      expect(getNextDealer(withResult)).toBe(P1); // Loser deals
    });
  });
});
