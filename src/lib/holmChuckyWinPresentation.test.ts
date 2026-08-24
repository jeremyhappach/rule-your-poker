import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  getHolmChuckyWinPresentationCompletionKey,
  type HolmPresentationIdentity,
} from './holmPresentationBarrier';

const identity: HolmPresentationIdentity = {
  dealerGameId: 'dealer-game',
  roundId: 'round',
  handNumber: 1,
  transferCursor: 7,
};

describe('Holm Chucky-win terminal presentation gate', () => {
  it.each(['settled', 'reconciled'] as const)(
    'releases after both the celebration and exact cursor are %s',
    (cursorState) => {
      expect(getHolmChuckyWinPresentationCompletionKey({
        identity,
        activeTriggerId: 'win-trigger',
        completedTriggerId: 'win-trigger',
        cursorState,
      })).toBe('dealer-game|round|h1|cursor:7|chucky-win:win-trigger');
    },
  );

  it.each(['unknown', 'queued', 'running', 'reconciling'] as const)(
    'does not release from the invisible celebration clock while the cursor is %s',
    (cursorState) => {
      expect(getHolmChuckyWinPresentationCompletionKey({
        identity,
        activeTriggerId: 'win-trigger',
        completedTriggerId: 'win-trigger',
        cursorState,
      })).toBeNull();
    },
  );

  it('supports cursor-first/result-second ordering and rejects the wrong result identity', () => {
    expect(getHolmChuckyWinPresentationCompletionKey({
      identity,
      activeTriggerId: 'win-trigger',
      completedTriggerId: null,
      cursorState: 'settled',
    })).toBeNull();
    expect(getHolmChuckyWinPresentationCompletionKey({
      identity,
      activeTriggerId: 'win-trigger',
      completedTriggerId: 'old-trigger',
      cursorState: 'settled',
    })).toBeNull();
  });

  it('wires postgame only through the combined durable gate', () => {
    const source = readFileSync(
      new URL('../components/MobileGameTable.tsx', import.meta.url),
      'utf8',
    );
    const legacyCompletionStart = source.indexOf('onAnimationComplete={() => {', source.indexOf('<HolmWinPotAnimation'));
    const legacyCompletionEnd = source.indexOf('}}', legacyCompletionStart);
    const legacyCompletion = source.slice(legacyCompletionStart, legacyCompletionEnd);

    expect(source).toContain('getHolmChuckyWinPresentationCompletionKey({');
    expect(source).toContain('releasedHolmWinPresentationKeysRef.current.add');
    expect(legacyCompletion).not.toContain('onHolmWinPotAnimationComplete?.()');
  });
});
