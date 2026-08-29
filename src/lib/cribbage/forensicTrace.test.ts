import { beforeEach, describe, expect, it } from 'vitest';
import {
  CRIBBAGE_FORENSIC_TRACE_MAX_ENTRIES,
  captureCribbageForensicTail,
  clearCribbageForensicTrace,
  recordCribbageForensicEvent,
  setCribbageForensicIdentity,
} from './forensicTrace';

const options = {
  producerComponent: 'CribbageMobileGameTable',
  producerFunction: 'test',
};

describe('Cribbage forensic trace', () => {
  beforeEach(() => {
    clearCribbageForensicTrace();
  });

  it('deduplicates identical events and retains the current identity', () => {
    setCribbageForensicIdentity({
      gameId: 'game-a',
      roundId: 'round-a',
      handNumber: 4,
      phase: 'pegging',
    });

    recordCribbageForensicEvent('boundary', 'hold-started', { count: 31 }, {
      ...options,
      dedupeKey: 'boundary-4',
    });
    recordCribbageForensicEvent('boundary', 'hold-started', { count: 31 }, {
      ...options,
      dedupeKey: 'boundary-4',
    });

    const tail = captureCribbageForensicTail();
    expect(tail).toHaveLength(1);
    expect(tail[0]).toMatchObject({
      group: 'boundary',
      tag: 'hold-started',
      identity: {
        gameId: 'game-a',
        roundId: 'round-a',
        handNumber: 4,
        phase: 'pegging',
      },
    });
  });

  it('hard-bounds the ring and resets it when game identity changes', () => {
    setCribbageForensicIdentity({ gameId: 'game-a' });
    for (let index = 0; index < CRIBBAGE_FORENSIC_TRACE_MAX_ENTRIES + 12; index += 1) {
      recordCribbageForensicEvent('deal', 'arrival', { index }, {
        ...options,
        dedupeKey: `arrival-${index}`,
      });
    }

    expect(captureCribbageForensicTail(Number.MAX_SAFE_INTEGER)).toHaveLength(
      CRIBBAGE_FORENSIC_TRACE_MAX_ENTRIES,
    );

    setCribbageForensicIdentity({ gameId: 'game-b', handNumber: 1 });
    expect(captureCribbageForensicTail()).toEqual([]);
  });

  it('bounds oversized event payloads', () => {
    setCribbageForensicIdentity({ gameId: 'game-a' });
    recordCribbageForensicEvent('interaction', 'large-payload', {
      value: 'x'.repeat(5_000),
    }, options);

    expect(captureCribbageForensicTail()[0]?.payload).toMatchObject({
      truncated: true,
      originalLength: expect.any(Number),
    });
  });

  it('resets the ring when the dealer-game scope rotates', () => {
    setCribbageForensicIdentity({ gameId: 'game-a', dealerGameId: 'dealer-a' });
    recordCribbageForensicEvent('boundary', 'old-dealer-game', {}, options);

    setCribbageForensicIdentity({ gameId: 'game-a', dealerGameId: 'dealer-b' });
    expect(captureCribbageForensicTail()).toEqual([]);
  });
});
