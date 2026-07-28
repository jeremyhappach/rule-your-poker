/**
 * Targeted unit tests for cribbage pegging Go / last-card scoring.
 *
 * Repro under test:
 *   2 players (Hap vs bot), count reaches 18.
 *   Hap plays Q  → 28
 *   Bot has no playable card → callGo
 *   Hap plays A  → 29
 *   Hap has no playable card → callGo (auto-go in UI)
 *   Expected: Hap +1 (Go), lastEvent.type='go_point', reset, bot leads next run.
 *
 * Also exercises the patched fallback in advanceToNextPeggingTurn for the
 * 3-player case where every card-holder has already called go and the
 * just-played player exhausts their hand.
 */

import { describe, it, expect } from 'vitest';
import type {
  CribbageState,
  CribbageCard,
  CribbagePlayerState,
} from './cribbageTypes';
import { playPeggingCard, callGo } from './cribbageGameLogic';

const card = (rank: string, suit: CribbageCard['suit'] = 'spades'): CribbageCard => ({
  rank,
  suit,
  value: rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10),
});

function makePlayer(id: string, hand: CribbageCard[], pegScore = 0): CribbagePlayerState {
  return { playerId: id, hand, pegScore, hasCalledGo: false, discardedToCrib: [] };
}

function baseState(overrides: Partial<CribbageState> = {}): CribbageState {
  return {
    phase: 'pegging',
    dealerPlayerId: 'bot',
    cribOwnerPlayerId: 'bot',
    playerStates: {},
    turnOrder: [],
    crib: [],
    cutCard: card('5', 'hearts'),
    pegging: {
      playedCards: [],
      currentCount: 0,
      currentTurnPlayerId: null,
      lastToPlay: null,
      goCalledBy: [],
      sequenceStartIndex: 0,
    },
    anteAmount: 0,
    pot: 0,
    pointsToWin: 121,
    skunkEnabled: false,
    skunkThreshold: 0,
    doubleSkunkEnabled: false,
    doubleSkunkThreshold: 0,
    lastEvent: null,
    winnerPlayerId: null,
    loserScore: null,
    payoutMultiplier: 1,
    ...overrides,
  };
}

describe('cribbage pegging — Hap/bot dead-end Go repro (2 players)', () => {
  // Setup: count is at 18 (some prior plays happened), Hap to act.
  // Hap = pone (non-dealer, plays first). turnOrder = [hap, bot].
  // Hap hand: Q, A, K, J. Bot hand: Q, K, J (all worth 10).
  const setup = () => {
    const prior = [
      { playerId: 'bot', card: card('8', 'clubs') },
      { playerId: 'hap', card: card('10', 'diamonds') },
    ]; // 8 + 10 = 18
    return baseState({
      turnOrder: ['hap', 'bot'],
      playerStates: {
        hap: makePlayer('hap', [card('Q'), card('A'), card('K', 'hearts'), card('J', 'clubs')]),
        bot: makePlayer('bot', [card('Q', 'hearts'), card('K', 'diamonds'), card('J', 'diamonds')]),
      },
      pegging: {
        playedCards: prior,
        currentCount: 18,
        currentTurnPlayerId: 'hap',
        lastToPlay: 'bot',
        goCalledBy: [],
        sequenceStartIndex: 0,
      },
    });
  };

  it('auto-skips the blocked player and holds spotlight on hap; then awards +1 Go when hap is also blocked', () => {
    let s = setup();

    // 1) Hap plays Q (index 0) → count 28. Bot has no legal play at 28
    //    (all 10s), so advanceToNextPeggingTurn auto-adds bot to
    //    goCalledBy and keeps the spotlight on hap (who can still play
    //    the Ace). Spotlight never transiently moves to bot.
    s = playPeggingCard(s, 'hap', 0);
    expect(s.pegging.currentCount).toBe(28);
    expect(s.pegging.lastToPlay).toBe('hap');
    expect(s.pegging.goCalledBy).toEqual(['bot']);
    expect(s.pegging.currentTurnPlayerId).toBe('hap');
    // No Go point yet — hap still has playable cards.
    expect(s.playerStates.hap.pegScore).toBe(0);
    expect(s.lastEvent).toBeNull();

    // 2) Hap plays A (index 0 in remaining [A, K, J]) → count 29. Now
    //    hap has [K, J] — no legal play; bot already in goCalledBy →
    //    fallback fires: +1 Go to lastToPlay (hap), event go_point,
    //    count reset, bot leads next run.
    s = playPeggingCard(s, 'hap', 0);

    expect(s.playerStates.hap.pegScore).toBe(1);
    expect(s.playerStates.bot.pegScore).toBe(0);

    expect(s.lastEvent?.type).toBe('go_point');
    expect(s.lastEvent?.playerId).toBe('hap');
    expect(s.lastEvent?.points).toBe(1);
    expect(s.lastEvent?.label).toBe('Go');

    expect(s.pegging.currentCount).toBe(0);
    expect(s.pegging.currentTurnPlayerId).toBe('bot');
    expect(s.pegging.goCalledBy).toEqual([]);
    expect(s.pegging.lastToPlay).toBeNull();

    expect(s.playerStates.hap.hand.map(c => c.rank)).toEqual(['K', 'J']);
    expect(s.playerStates.bot.hand.map(c => c.rank)).toEqual(['Q', 'K', 'J']);
  });

  it('manual callGo remains callable if the current turn player has no playable card', () => {
    // Bootstrap the same 28-count situation but leave bot as
    // currentTurnPlayerId (i.e., simulate a pre-auto-skip snapshot).
    // This proves callGo still works for legacy call sites.
    const s0 = baseState({
      turnOrder: ['hap', 'bot'],
      playerStates: {
        hap: makePlayer('hap', [card('A'), card('K'), card('J')]),
        bot: makePlayer('bot', [card('Q', 'hearts'), card('K', 'diamonds'), card('J', 'diamonds')]),
      },
      pegging: {
        playedCards: [],
        currentCount: 28,
        currentTurnPlayerId: 'bot',
        lastToPlay: 'hap',
        goCalledBy: [],
        sequenceStartIndex: 0,
      },
    });
    const s = callGo(s0, 'bot');
    expect(s.pegging.goCalledBy).toContain('bot');
    // advance loop after callGo lands on hap (playable at 28).
    expect(s.pegging.currentTurnPlayerId).toBe('hap');
  });
});

describe('cribbage pegging — 3-player advanceToNextPeggingTurn fallback', () => {
  // Scenario: count=29. p1, p2 already said go. p3 plays his last playable card,
  // exhausting his hand. advanceToNextPeggingTurn finds no qualifying next player
  // (p1, p2 in goCalledBy; p3 hand empty) → fallback branch.
  it('awards +1 Go to lastToPlay and emits go_point when fallback fires', () => {
    const state = baseState({
      turnOrder: ['p1', 'p2', 'p3'],
      playerStates: {
        p1: makePlayer('p1', [card('K')]),       // 10, can't play at 29
        p2: makePlayer('p2', [card('J')]),       // 10, can't play at 29
        p3: makePlayer('p3', [card('A')]),       // 1, playable at 29 → 30
      },
      pegging: {
        playedCards: [
          { playerId: 'p3', card: card('9', 'clubs') },
          { playerId: 'p1', card: card('10', 'hearts') },
          { playerId: 'p2', card: card('10', 'diamonds') },
        ], // 9+10+10 = 29
        currentCount: 29,
        currentTurnPlayerId: 'p3',
        lastToPlay: 'p2',
        goCalledBy: ['p1', 'p2'],
        sequenceStartIndex: 0,
      },
    });

    // p3 plays A (index 0) → count 30, hand empty
    const after = playPeggingCard(state, 'p3', 0);

    // p3 should receive +1 Go (only legal claimant — lastToPlay after their play).
    expect(after.playerStates.p3.pegScore).toBe(1);
    expect(after.playerStates.p1.pegScore).toBe(0);
    expect(after.playerStates.p2.pegScore).toBe(0);
    expect(after.lastEvent?.type).toBe('go_point');
    expect(after.lastEvent?.playerId).toBe('p3');
    expect(after.lastEvent?.points).toBe(1);

    // Count reset; next leader = findNextPlayerWithCards after p3 → p1.
    expect(after.pegging.currentCount).toBe(0);
    expect(after.pegging.currentTurnPlayerId).toBe('p1');
    expect(after.pegging.goCalledBy).toEqual([]);
  });

  it('does NOT double-award when fallback would fire on the same play as a 31', () => {
    // Same shape but rigged so p3 hits 31 exactly. playPeggingCard returns via
    // beginNewPeggingRun on the 31 branch BEFORE reaching advanceToNextPeggingTurn,
    // so the fallback +1 must not apply. p3 should get only the +2 from the 31
    // (recorded as pegging_points, not go_point).
    const state = baseState({
      turnOrder: ['p1', 'p2', 'p3'],
      playerStates: {
        p1: makePlayer('p1', [card('K')]),
        p2: makePlayer('p2', [card('J')]),
        p3: makePlayer('p3', [card('2')]),   // 2 → 29 + 2 = 31
      },
      pegging: {
        playedCards: [
          { playerId: 'p3', card: card('9', 'clubs') },
          { playerId: 'p1', card: card('10', 'hearts') },
          { playerId: 'p2', card: card('10', 'diamonds') },
        ],
        currentCount: 29,
        currentTurnPlayerId: 'p3',
        lastToPlay: 'p2',
        goCalledBy: ['p1', 'p2'],
        sequenceStartIndex: 0,
      },
    });

    const after = playPeggingCard(state, 'p3', 0);

    // p3 gets exactly +2 for 31 — no additional +1 from the fallback.
    expect(after.playerStates.p3.pegScore).toBe(2);
    expect(after.lastEvent?.type).toBe('pegging_points');
    expect(after.pegging.currentCount).toBe(0); // reset on 31
  });
});
