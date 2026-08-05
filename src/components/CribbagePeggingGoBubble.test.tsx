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
    cleanup();
    // Provide the [data-chip-center] chip anchors AND the canonical felt
    // surface so the remote bubble can derive an inward direction.
    document.body.innerHTML = `
      <div data-canonical-felt-surface style="position:absolute;left:100px;top:100px;width:400px;height:400px"></div>
      <div data-chip-center="1" data-testid="chip-1" style="position:absolute;left:50px;top:150px;width:20px;height:20px"></div>
      <div data-chip-center="2" data-testid="chip-2" style="position:absolute;left:550px;top:150px;width:20px;height:20px"></div>
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
      document.querySelector('[data-cribbage-go-bubble="2"]'),
    ).not.toBeNull();

    // Latch clears when the new run leader plays.
    const sAfter = playPeggingCard(s, 'bot', 0);
    expect(sAfter.pegging.pendingGoBubblePlayerIds).toBeUndefined();
    expect(sAfter.pegging.goCalledBy).toEqual([]);
  });

  it('does NOT render a bubble when the blocked player is the local viewer', async () => {
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
        currentTurnPlayerId: 'bot',
        lastToPlay: 'bot',
        goCalledBy: ['hap'],
        sequenceStartIndex: 0,
      },
    });

    render(
      <CribbagePeggingGoBubble
        cribbageState={s}
        playerPositionById={positions}
        localPlayerId="hap"
        isPeggingPresentation
      />,
    );
    await new Promise(r => requestAnimationFrame(() => r(null)));
    expect(screen.queryByText('Go')).toBeNull();
    // No local-oriented DOM node must remain either.
    expect(document.querySelector('[data-cribbage-go-orientation="local"]')).toBeNull();
  });

  it('remote bubble carries the light-green fill and dark-green border styling', async () => {
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
        localPlayerId="hap"
        isPeggingPresentation
      />,
    );
    await new Promise(r => requestAnimationFrame(() => r(null)));
    await new Promise(r => setTimeout(r, 0));
    const bubble = document.querySelector<HTMLElement>('[data-cribbage-go-bubble="2"]');
    expect(bubble).not.toBeNull();
    const body = bubble!.querySelector<HTMLElement>(':scope > div');
    expect(body).not.toBeNull();
    expect(bubble!.querySelectorAll('[data-cribbage-go-tail]')).toHaveLength(1);
    expect(bubble!.className).toContain('pointer-events-none');
    // Light-green fill (#a7f3d0) and dark-green border (#047857). jsdom
    // may normalize colors; assert on the raw inline style string so we
    // read the hex the component actually wrote.
    const styleText = (body!.getAttribute('style') ?? '').toLowerCase();
    // Light-green fill (#a7f3d0 → rgb(167, 243, 208)) and dark-green
    // border (#047857 → rgb(4, 120, 87)).
    expect(styleText).toContain('rgb(167, 243, 208)');
    expect(styleText).toContain('rgb(4, 120, 87)');
    expect(styleText).toContain('color: rgb(0, 0, 0)');
    expect(styleText).toContain('border-radius: 12px');
  });

  it('skips render entirely when the remote chip anchor is missing (no fallback)', async () => {
    document.body.innerHTML = `
      <div data-canonical-felt-surface style="position:absolute;left:100px;top:100px;width:400px;height:400px"></div>
    `;
    const s = baseState({
      turnOrder: ['hap', 'bot'],
      playerStates: {
        hap: { playerId: 'hap', hand: [card('A')], pegScore: 0, hasCalledGo: false, discardedToCrib: [] },
        bot: { playerId: 'bot', hand: [card('Q', 'hearts')], pegScore: 0, hasCalledGo: false, discardedToCrib: [] },
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
        localPlayerId="hap"
        isPeggingPresentation
      />,
    );
    await new Promise(r => requestAnimationFrame(() => r(null)));
    expect(screen.queryByText('Go')).toBeNull();
  });
});
