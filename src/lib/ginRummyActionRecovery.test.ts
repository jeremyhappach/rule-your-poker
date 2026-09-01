import { describe, expect, it, vi } from 'vitest';
import {
  buildGinPublicPeerProjection,
  executeReplaySafeGinAction,
  isRetryableGinTransportError,
  shouldFetchGinProjectionForRealtimeUpdate,
} from './ginRummyActionRecovery';
import type { GinRummyCard, GinRummyPlayerState, GinRummyState } from './ginRummyTypes';

const card = (rank: string, suit: GinRummyCard['suit'] = '♠'): GinRummyCard => ({
  rank,
  suit,
  value: Number(rank) || 10,
});

const playerState = (playerId: string, hand: GinRummyCard[]): GinRummyPlayerState => ({
  playerId,
  hand,
  melds: [],
  deadwood: [],
  deadwoodValue: 0,
  hasKnocked: false,
  hasGin: false,
  laidOffCards: [],
});

const state = (overrides: Partial<GinRummyState> = {}): GinRummyState => ({
  phase: 'playing',
  dealerPlayerId: 'player-1',
  nonDealerPlayerId: 'player-2',
  playerStates: {
    'player-1': playerState('player-1', Array.from({ length: 10 }, (_, index) => card(String(index + 1)))),
    'player-2': playerState('player-2', Array.from({ length: 10 }, (_, index) => card(String(index + 1), '♥'))),
  },
  turnOrder: ['player-2', 'player-1'],
  stockPile: [],
  discardPile: [card('K', '♦')],
  currentTurnPlayerId: 'player-2',
  turnPhase: 'draw',
  drawSource: null,
  firstDrawOfferedTo: null,
  firstDrawPassed: [],
  anteAmount: 0,
  pot: 0,
  pointsToWin: 100,
  matchScores: { 'player-1': 0, 'player-2': 0 },
  knockResult: null,
  actionCount: 7,
  handNumber: 3,
  lastAction: null,
  winnerPlayerId: null,
  ...overrides,
});

const maskedHand = (length: number): GinRummyCard[] => Array.from(
  { length },
  () => ({ rank: '?', suit: '?' as GinRummyCard['suit'], value: 0 }),
);

describe('Gin action transport recovery', () => {
  it('returns the first successful authoritative response without replaying', async () => {
    const operation = vi.fn(async () => ({ outcome: 'applied' }));

    await expect(executeReplaySafeGinAction(operation, { timeoutMs: 100 })).resolves.toEqual({
      outcome: 'applied',
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('replays the exact request after a lost response and accepts stale_action reconciliation', async () => {
    const requestIdentity = { expectedActionCount: 7, action: 'discard' } as const;
    const seenIdentities: unknown[] = [];
    const operation = vi.fn(async () => {
      seenIdentities.push(requestIdentity);
      if (seenIdentities.length === 1) throw new TypeError('Failed to fetch');
      return { outcome: 'stale_action', actionCount: 8 };
    });

    await expect(executeReplaySafeGinAction(operation, {
      timeoutMs: 100,
      retryDelayMs: 0,
    })).resolves.toEqual({ outcome: 'stale_action', actionCount: 8 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(seenIdentities).toEqual([requestIdentity, requestIdentity]);
  });

  it('replays the exact request after PostgreSQL cancels a statement timeout', async () => {
    const requestIdentity = { expectedActionCount: 21, action: 'draw_stock' } as const;
    const seenIdentities: unknown[] = [];
    const operation = vi.fn(async () => {
      seenIdentities.push(requestIdentity);
      if (seenIdentities.length === 1) {
        throw Object.assign(new Error('canceling statement due to statement timeout'), {
          code: '57014',
        });
      }
      return { outcome: 'applied', actionCount: 22 };
    });

    await expect(executeReplaySafeGinAction(operation, {
      timeoutMs: 100,
      retryDelayMs: 0,
    })).resolves.toEqual({ outcome: 'applied', actionCount: 22 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(seenIdentities).toEqual([requestIdentity, requestIdentity]);
  });

  it('does not replay an authoritative rule error', async () => {
    const operation = vi.fn(async () => {
      throw new Error('Gin action targeted a stale hand identity');
    });

    await expect(executeReplaySafeGinAction(operation, { timeoutMs: 100 })).rejects.toThrow(
      'stale hand identity',
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('releases the caller after the bounded retry budget is exhausted', async () => {
    vi.useFakeTimers();
    const operation = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const request = executeReplaySafeGinAction(operation, {
      timeoutMs: 50,
      retryDelayMs: 10,
    });
    const assertion = expect(request).rejects.toThrow('could not be confirmed after 2 attempts');

    await vi.advanceTimersByTimeAsync(120);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('recognizes the browser and chaos-harness transport failures', () => {
    expect(isRetryableGinTransportError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isRetryableGinTransportError(new Error('simulated response loss after send'))).toBe(true);
    expect(isRetryableGinTransportError({ code: '57014', message: 'statement canceled' })).toBe(true);
    expect(isRetryableGinTransportError(new Error('canceling statement due to statement timeout'))).toBe(true);
    expect(isRetryableGinTransportError(new Error('rule violation'))).toBe(false);
  });

  it('skips an actor Realtime echo only after the same authoritative action is installed', () => {
    expect(shouldFetchGinProjectionForRealtimeUpdate({ actionCount: 8 }, 8)).toBe(false);
    expect(shouldFetchGinProjectionForRealtimeUpdate({ actionCount: 7 }, 8)).toBe(false);
    expect(shouldFetchGinProjectionForRealtimeUpdate({ actionCount: 8 }, 7)).toBe(true);
    expect(shouldFetchGinProjectionForRealtimeUpdate({ actionCount: 8 }, null)).toBe(true);
    expect(shouldFetchGinProjectionForRealtimeUpdate({}, 8)).toBe(true);
  });

  it('admits the next opponent public action while preserving the caller exact hand', () => {
    const current = state();
    const publicUpdate = state({
      actionCount: 8,
      currentTurnPlayerId: 'player-1',
      playerStates: {
        'player-1': playerState('player-1', maskedHand(10)),
        'player-2': playerState('player-2', maskedHand(10)),
      },
      lastAction: {
        type: 'discard',
        playerId: 'player-2',
        card: card('Q', '♥'),
        timestamp: 'server-time',
      },
    });

    const projected = buildGinPublicPeerProjection(publicUpdate, current, 'player-1');

    expect(projected?.actionCount).toBe(8);
    expect(projected?.currentTurnPlayerId).toBe('player-1');
    expect(projected?.playerStates['player-1'].hand).toEqual(current.playerStates['player-1'].hand);
    expect(projected?.playerStates['player-2'].hand).toEqual(maskedHand(10));
    expect(publicUpdate.playerStates['player-1'].hand).toEqual(maskedHand(10));
  });

  it('refuses public fast-path admission when the local private hand might have changed', () => {
    const current = state();
    const selfDraw = state({
      actionCount: 8,
      playerStates: {
        'player-1': playerState('player-1', maskedHand(11)),
        'player-2': playerState('player-2', maskedHand(10)),
      },
      lastAction: {
        type: 'draw_stock',
        playerId: 'player-1',
        card: maskedHand(1)[0],
        timestamp: 'server-time',
      },
    });

    expect(buildGinPublicPeerProjection(selfDraw, current, 'player-1')).toBeNull();
    expect(buildGinPublicPeerProjection({ ...selfDraw, handNumber: 4 }, current, 'player-1')).toBeNull();
    expect(buildGinPublicPeerProjection({ ...selfDraw, actionCount: 9 }, current, 'player-1')).toBeNull();
  });

  it('admits an authoritative public reveal without carrying a stale private hand', () => {
    const current = state();
    const reveal = state({
      phase: 'knocking',
      actionCount: 8,
      lastAction: {
        type: 'knock',
        playerId: 'player-1',
        card: card('K'),
        timestamp: 'server-time',
      },
    });

    expect(buildGinPublicPeerProjection(reveal, current, 'player-1')).toBe(reveal);
  });
});
