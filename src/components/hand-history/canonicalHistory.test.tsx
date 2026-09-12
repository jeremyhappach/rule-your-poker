// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CanonicalHistoryView } from './CanonicalHistoryView';
import { peggingTotals, recordedChange, resultText } from './canonicalHistory';
import type { HistoryEvent, HistoryGame, HistoryHand } from './canonicalHistory';

afterEach(cleanup);
const event = (type: string, payload: HistoryEvent['payload'], actorId: string | null = null, sequence = 1): HistoryEvent => ({ id: `${type}:${sequence}`, roundId: 'round', roundNumber: 1, sequence, type, actorId, payload, occurredAt: '2026-09-12T00:00:00Z' });
const hand = (events: HistoryEvent[] = []): HistoryHand => ({ id: 'hand', handNumber: 7,
  participants: [{ playerId: 'hap', userId: 'user-hap', name: 'Hap' }, { playerId: 'mcru', userId: 'user-mcru', name: 'mcru81' }],
  opening: { stacks: { hap: 20, mcru: 30 }, pot: 16 }, closing: { stacks: { hap: 36, mcru: 15 } },
  scoresAfter: null, terminal: false, provenance: 'captured', events,
});
const game = (h: HistoryHand, gameType = 'holm-game'): HistoryGame => ({ id: 'game', gameType, startedAt: '2026-09-12T00:00:00Z', config: {}, hands: [h] });
const win = event('result', { amount: 16, deltas: { hap: 16, mcru: -15 }, name: 'Hap', description: 'Two Pair' }, 'hap');

describe('canonical history', () => {
  it('keeps winner payout separate from each historical viewer’s signed change', () => {
    const h = hand([win]);
    expect(resultText(win, h)).toBe('Hap won $16 — Two Pair');
    expect(recordedChange(h, 'user-hap')).toBe(16);
    expect(recordedChange(h, 'user-mcru')).toBe(-15);
    expect(recordedChange(h, 'observer')).toBeNull();
  });
  it('does not infer exposure from a stay, winner or final state', () => {
    const h = hand([event('action', { action: 'stay' }, 'mcru'), win]);
    render(<CanonicalHistoryView games={[game(h)]} selected="game" selectGame={() => {}} viewerId="user-hap" />);
    expect(screen.queryByText('Exposed Hands')).toBeNull();
    expect(screen.queryByText('You')).toBeNull();
    expect(screen.getByText('mcru81 stayed')).toBeTruthy();
  });
  it('starts every hand, round and financial accordion collapsed', () => {
    const h = hand([win, { ...event('action', { action: 'fold' }, 'mcru', 2), roundId: 'round-two', roundNumber: 2 }]);
    const { container } = render(<CanonicalHistoryView games={[game(h, '3-5-7')]} selected="game" selectGame={() => {}} />);
    const details = [...container.querySelectorAll('details')];
    expect(details.length).toBeGreaterThanOrEqual(5);
    expect(details.every(d => !d.open)).toBe(true);
    fireEvent.click(screen.getByText('Hand 7'));
    expect(container.querySelector('details')?.open).toBe(true);
    expect(details.slice(1).every(d => !d.open)).toBe(true);
  });
  it('uses the authoritative terminal score and keeps pegging separate from counting', () => {
    const h = hand([event('pegging_award', { points: 6 }, 'hap'), event('pegging_award', { points: 5 }, 'mcru', 2), event('counting', { awards: { hap: 22 }, scoresAfter: { hap: 95, mcru: 98 } })]);
    h.scoresAfter = { hap: 110, mcru: 123 }; h.terminal = true;
    expect(peggingTotals(h.events)).toEqual({ hap: 6, mcru: 5 });
    const { container } = render(<CanonicalHistoryView games={[game(h, 'cribbage')]} selected="game" selectGame={() => {}} />);
    expect(screen.getByText('Pegging — Hap +6, mcru81 +5')).toBeTruthy();
    expect(screen.getAllByText('Hap 110 · mcru81 123')).toHaveLength(2);
    expect([...container.querySelectorAll('details')].every(d => !d.open)).toBe(true);
  });
  it('renders Gin identities by UUID and running match scores', () => {
    const h = hand([event('gin_result', { result: { winnerId: 'mcru', knockerId: 'mcru', opponentId: 'hap', pointsAwarded: 16 }, playerStates: { mcru: { deadwoodValue: 10 }, hap: { deadwoodValue: 26 } } })]);
    h.scoresAfter = { hap: 63, mcru: 111 };
    render(<CanonicalHistoryView games={[game(h, 'gin-rummy')]} selected="game" selectGame={() => {}} viewerId="user-hap" />);
    expect(screen.getByText('mcru81 — 10 deadwood')).toBeTruthy();
    expect(screen.getByText('Hap 63 · mcru81 111')).toBeTruthy();
    expect(screen.queryByText(/You/)).toBeNull();
  });
  it('does not synthesize absent legacy financial snapshots', () => {
    const h = hand(); h.opening = {}; h.closing = null; h.provenance = 'legacy_partial';
    render(<CanonicalHistoryView games={[game(h)]} selected="game" selectGame={() => {}} />);
    expect(screen.getAllByText('Stacks were not recorded for this hand.')).toHaveLength(2);
    expect(screen.getByText('Starting pot: Not recorded')).toBeTruthy();
  });
  it('uses the stored split amount with no invented sole winner', () => {
    const e = event('result', { name: 'Hap & mcru81', amount: 18, isChopped: true, deltas: { hap: 9, mcru: 9 } });
    expect(resultText(e, hand())).toBe('Hap & mcru81 shared $18');
  });
});
