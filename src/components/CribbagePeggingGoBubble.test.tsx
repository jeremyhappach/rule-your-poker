// @vitest-environment jsdom
/**
 * Presentation-level tests for CribbagePeggingGoBubble.
 *
 * Second-case proof (immediate-Go resolution): after A plays a card
 * that leaves both players blocked, the authoritative reducer clears
 * pegging.goCalledBy in the same frame it awards the go_point event.
 * The bubble must still render, driven by the
 * pegging.pendingGoBubblePlayerIds latch.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CribbagePeggingGoBubble } from './CribbagePeggingGoBubble';
import type { CribbageState } from '@/lib/cribbageTypes';
import { playPeggingCard } from '@/lib/cribbageGameLogic';

const card = (rank: string, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' = 'spades') => ({
  rank,
  suit,
  value: rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10),
});

const baseState = (o: Partial<CribbageState> = {}): CribbageState => ({
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
  ...o,
});

describe('CribbagePeggingGoBubble presentation', () => {
  beforeEach(() => {
    // Provide the [data-chip-center] anchor DOM nodes.
    document.body.innerHTML = `
      <div data-chip-center="1" data-testid="chip-1"></div>
      <div data-chip-center="2" data-testid="chip-2"></div>
    `;
  });

  const positions = new Map<string, number>([
    ['hap', 1],
    ['bot', 2],
  ]);

  it('renders bubble on the blocked opponent during the continuing-holder case (goCalledBy)', async () => {
    const s = baseState({
      turnOrder: ['hap', 'bot'],
      playerStates: {
        hap: {
          playerId: 'hap',
          hand: [card('A')],
          pegScore: 0,
          hasCalledGo: false,
          discardedToCrib: [],
        },
        bot: {
          playerId: 'bot',
          hand: [card('Q', 'hearts')],
          pegScore: 0,
          hasCalledGo: false,
          discardedToCrib: [],
        },
      },
      pegging: {
        playedCards: [],
        currentCount: 28,
        currentTurnPlayerId: 'hap',
        lastToPlay: 'hap',
        goCalledBy: ['bot'],
        sequenceStartIndex: 0,
      },
    });

    render(
      <CribbagePeggingGoBubble
        cribbageState={s}
        playerPositionById={positions}
        isPeggingPresentation
      />,
    );
    // requestAnimationFrame resolution — wait a tick.
    await new Promise(r => requestAnimationFrame(() => r(null)));
    const bubbles = await screen.findAllByText('Go');
    expect(bubbles.length).toBe(1);
    expect(document.querySelector('[data-cribbage-go-bubble="2"]')).not.toBeNull();
  });

  it('renders bubble during the IMMEDIATE-Go resolution (pendingGoBubblePlayerIds latch)', async () => {
    // Reproduce the Hap/bot terminal Go via the authoritative reducer,
    // so we exercise the same state-shape the app renders.
    let s = baseState({
      turnOrder: ['hap', 'bot'],
      playerStates: {
        hap: {
          playerId: 'hap',
          hand: [card('Q'), card('A'), card('K', 'hearts'), card('J', 'clubs')],
          pegScore: 0,
          hasCalledGo: false,
          discardedToCrib: [],
        },
        bot: {
          playerId: 'bot',
          hand: [card('Q', 'hearts'), card('K', 'diamonds'), card('J', 'diamonds')],
          pegScore: 0,
          hasCalledGo: false,
          discardedToCrib: [],
        },
      },
      pegging: {
        playedCards: [
          { playerId: 'bot', card: card('8', 'clubs') },
          { playerId: 'hap', card: card('10', 'diamonds') },
        ],
        currentCount: 18,
        currentTurnPlayerId: 'hap',
        lastToPlay: 'bot',
        goCalledBy: [],
        sequenceStartIndex: 0,
      },
    });

    s = playPeggingCard(s, 'hap', 0); // Q → 28 (bot auto-Go, spotlight holds)
    s = playPeggingCard(s, 'hap', 0); // A → 29 → immediate Go award

    // Authoritative post-condition matching the reducer contract.
    expect(s.pegging.goCalledBy).toEqual([]);
    expect(s.pegging.pendingGoBubblePlayerIds).toEqual(['bot']);
    expect(s.lastEvent?.type).toBe('go_point');

    render(
      <CribbagePeggingGoBubble
        cribbageState={s}
        playerPositionById={positions}
        isPeggingPresentation
      />,
    );
    await new Promise(r => requestAnimationFrame(() => r(null)));
    const bubbles = await screen.findAllByText('Go');
    expect(bubbles.length).toBe(1);
    expect(
      document.querySelector('[data-chip-center="2"] [data-cribbage-go-bubble]'),
    ).not.toBeNull();

    cleanup();

    // Latch clears when the new run leader plays.
    const sAfter = playPeggingCard(s, 'bot', 0);
    expect(sAfter.pegging.pendingGoBubblePlayerIds).toBeUndefined();
    render(
      <CribbagePeggingGoBubble
        cribbageState={sAfter}
        playerPositionById={positions}
        isPeggingPresentation
      />,
    );
    await new Promise(r => requestAnimationFrame(() => r(null)));
    expect(screen.queryByText('Go')).toBeNull();
  });
});
