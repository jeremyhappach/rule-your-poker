import { describe, expect, it, vi } from 'vitest';
vi.mock('./debugHarness/runtimeCache', () => ({ getActiveHarnessCached: () => null }));
import { horsesSccTerminalWinner } from './horsesSccTerminalPresentation';
import type { HorsesStateFromDB } from '@/hooks/useHorsesMobileController';

const state = (rankA: number, rankB: number): HorsesStateFromDB => ({
  currentTurnPlayerId: null, gamePhase: 'complete', turnOrder: ['uuid-a', 'uuid-b'],
  playerStates: Object.fromEntries(([['uuid-a', rankA], ['uuid-b', rankB]] as Array<[string, number]>).map(([id, rank]) => [id, {
    dice: [], isComplete: true, rollsRemaining: 0,
    result: { rank, description: 'same display name', ofAKindCount: 4, highValue: 6, isQualified: true, cargoSum: rank },
  }])),
});
describe('Horses/SCC terminal presentation destination', () => {
  it.each(['horses', 'ship-captain-crew'])('uses the authoritative player UUID for %s', gameType => {
    expect(horsesSccTerminalWinner(state(10, 9), gameType)).toBe('uuid-a');
    expect(horsesSccTerminalWinner(state(8, 9), gameType)).toBe('uuid-b');
  });
  it('never creates a single-winner celebration for a tie or unfinished state', () => {
    expect(horsesSccTerminalWinner(state(9, 9), 'horses')).toBeNull();
    expect(horsesSccTerminalWinner({ ...state(10, 9), gamePhase: 'playing' }, 'horses')).toBeNull();
    expect(horsesSccTerminalWinner(null, 'horses')).toBeNull();
  });
});
