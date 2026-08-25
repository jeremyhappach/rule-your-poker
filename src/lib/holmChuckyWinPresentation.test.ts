import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  getHolmChuckyWinCelebrationTrigger,
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
  const completeSoloPresentation = {
    activeTriggerId: 'win-trigger',
    handContextId: 'hand-1',
    isSoloVsChucky: true,
    soloTabledCardsLandedHand: 'hand-1',
    communityFullyRevealed: true,
    soloAnnouncementEmittedHand: 'hand-1',
    soloChuckyAdmissionHand: 'hand-1',
    chuckyVisualRevealComplete: true,
  } as const;

  it('holds a result-first solo win until the exact cards-landed receipt exists', () => {
    expect(getHolmChuckyWinCelebrationTrigger({
      ...completeSoloPresentation,
      soloTabledCardsLandedHand: null,
    })).toBeNull();
  });

  it('holds a solo win through the hand-call and Chucky admission receipts', () => {
    expect(getHolmChuckyWinCelebrationTrigger({
      ...completeSoloPresentation,
      soloAnnouncementEmittedHand: null,
    })).toBeNull();
    expect(getHolmChuckyWinCelebrationTrigger({
      ...completeSoloPresentation,
      soloChuckyAdmissionHand: null,
    })).toBeNull();
  });

  it('starts the solo celebration only after the full exact-hand visual sequence', () => {
    expect(getHolmChuckyWinCelebrationTrigger(completeSoloPresentation)).toBe('win-trigger');
  });

  it('never treats an unhydrated Chucky branch as visually complete', () => {
    expect(getHolmChuckyWinCelebrationTrigger({
      ...completeSoloPresentation,
      isSoloVsChucky: false,
      communityFullyRevealed: false,
      chuckyVisualRevealComplete: true,
    })).toBeNull();
  });

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
