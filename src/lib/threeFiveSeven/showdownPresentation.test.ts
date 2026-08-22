import { describe, expect, it } from 'vitest';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import {
  buildThreeFiveSevenShowdownPresentation,
  getThreeFiveSevenShowdownTransferAdmission,
  isThreeFiveSevenOpponentRevealBoundaryReady,
  isThreeFiveSevenShowdownPresentationReady,
} from './showdownPresentation';

const presentation = (overrides: Partial<Parameters<typeof buildThreeFiveSevenShowdownPresentation>[0]> = {}) =>
  buildThreeFiveSevenShowdownPresentation({
    gameId: 'game-1',
    dealerGameId: 'dealer-1',
    roundId: 'round-1',
    handNumber: 2,
    roundNumber: 1,
    transferCursor: 8,
    result: 'Hap wins with a pair',
    revealAtShowdown: true,
    stayedPlayerIds: ['player-1', 'player-2'],
    roundCompleted: true,
    ...overrides,
  });

const playerToPlayerBatch = (
  cursor = 8,
  reason: ChipPresentationBatch['reason'] = 'win',
): Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'> => ({
  cursor,
  reason,
  transfers: [{
    id: `transfer-${cursor}`,
    amount: 6,
    from: { kind: 'player', playerId: 'player-2' },
    to: { kind: 'player', playerId: 'player-1' },
  }],
});

describe('3-5-7 showdown presentation identity', () => {
  it('requires an exact completed multi-stayer result frame', () => {
    expect(presentation()).not.toBeNull();
    expect(presentation({ roundCompleted: false })).toBeNull();
    expect(presentation({ stayedPlayerIds: ['player-1'] })).toBeNull();
    expect(presentation({ roundId: null })).toBeNull();
  });

  it('is stable across stayer ordering and changes across round identity', () => {
    const first = presentation()!;
    const reordered = presentation({ stayedPlayerIds: ['player-2', 'player-1'] })!;
    const successor = presentation({ roundId: 'round-2', roundNumber: 2 })!;

    expect(reordered.key).toBe(first.key);
    expect(successor.key).not.toBe(first.key);
  });

  it('skips the dwell entirely when Secret Reveal is disabled', () => {
    const noReveal = presentation({ revealAtShowdown: false })!;
    expect(isThreeFiveSevenShowdownPresentationReady(noReveal, null)).toBe(true);
    expect(getThreeFiveSevenShowdownTransferAdmission(
      playerToPlayerBatch(),
      noReveal,
      null,
    )).toBe(true);
  });

  it('starts the dwell only after every permitted opponent face is ready', () => {
    const revealed = presentation()!;
    expect(isThreeFiveSevenOpponentRevealBoundaryReady({
      presentation: revealed,
      viewerPlayerId: 'player-1',
      viewerStayed: true,
      faceReadyPlayerIds: [],
    })).toBe(false);
    expect(isThreeFiveSevenOpponentRevealBoundaryReady({
      presentation: revealed,
      viewerPlayerId: 'player-1',
      viewerStayed: true,
      faceReadyPlayerIds: ['player-2'],
    })).toBe(true);
  });

  it('uses the result boundary for a round 1-2 viewer who may not see proof cards', () => {
    expect(isThreeFiveSevenOpponentRevealBoundaryReady({
      presentation: presentation({ roundNumber: 2 }),
      viewerPlayerId: 'player-3',
      viewerStayed: false,
      faceReadyPlayerIds: [],
    })).toBe(true);
    expect(isThreeFiveSevenOpponentRevealBoundaryReady({
      presentation: presentation({ revealAtShowdown: false }),
      viewerPlayerId: 'player-3',
      viewerStayed: false,
      faceReadyPlayerIds: [],
    })).toBe(false);
  });

  it('holds the current database `win` batch until the exact reveal dwell completes', () => {
    const revealed = presentation()!;
    expect(getThreeFiveSevenShowdownTransferAdmission(
      playerToPlayerBatch(),
      revealed,
      null,
    )).toBe(false);
    expect(getThreeFiveSevenShowdownTransferAdmission(
      playerToPlayerBatch(),
      revealed,
      presentation({ roundId: 'round-older' })!.key,
    )).toBe(false);
    expect(getThreeFiveSevenShowdownTransferAdmission(
      playerToPlayerBatch(),
      revealed,
      revealed.key,
    )).toBe(true);
  });

  it('keeps legacy transfer batches compatible but exact-cursor scoped', () => {
    const revealed = presentation()!;
    expect(getThreeFiveSevenShowdownTransferAdmission(
      playerToPlayerBatch(8, 'transfer'),
      revealed,
      revealed.key,
    )).toBe(true);
    expect(getThreeFiveSevenShowdownTransferAdmission(
      playerToPlayerBatch(9, 'transfer'),
      revealed,
      revealed.key,
    )).toBe(false);
  });

  it('leaves unrelated financial batches to their existing owners', () => {
    expect(getThreeFiveSevenShowdownTransferAdmission({
      cursor: 8,
      reason: 'bet',
      transfers: [{
        id: 'tax',
        amount: 1,
        from: { kind: 'player', playerId: 'player-1' },
        to: { kind: 'pot' },
      }],
    }, presentation(), null)).toBeNull();
  });
});
