// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCribbageActiveHandSnapshot,
  clearCribbageActiveHandSnapshot,
  isUnexpectedCribbageRenderSourceMismatch,
  publishCribbageActiveHandSnapshot,
  type CribbageActiveHandSnapshotPublished,
} from './activeHandSnapshotStore';
import {
  clearCribbageForensicTrace,
  recordCribbageForensicEvent,
  setCribbageForensicIdentity,
} from './forensicTrace';

function makeSnapshot(
  overrides: Partial<CribbageActiveHandSnapshotPublished> = {},
): CribbageActiveHandSnapshotPublished {
  return {
    gameId: 'game-a',
    dealerGameId: 'dealer-a',
    viewerPlayerId: 'player-a',
    roundId: 'round-a',
    handNumber: 4,
    handContextId: 'hand-a',
    authoritativeHandCount: 6,
    sourceHandCount: 6,
    presentationHandCount: 6,
    clippedHandCount: 6,
    renderedHandCount: 6,
    resolverDecision: 'render-presentation',
    resolverReason: 'gameplay-authoritative',
    decisionKind: 'render-presentation',
    dealPhase: 'GAMEPLAY',
    activeIntentCountForHand: 0,
    settledCardCountForViewer: 6,
    cribbagePhase: 'discarding',
    renderHandKey: 'hand-a',
    currentHandKey: 'hand-a',
    parentSuppressed: false,
    activeHandBlocked: false,
    roundIdentityMismatch: false,
    handIdentityMismatch: false,
    emptyStageEarlyReturnActive: false,
    dealingPartialRevealActive: false,
    interactionsAllowed: true,
    isProcessing: false,
    selectedCardCount: 2,
    expectedDiscardCount: 2,
    discardButtonDisabled: false,
    haveDiscarded: false,
    isMyTurn: false,
    canPlayAnyCard: false,
    currentCount: 0,
    currentTurnPlayerId: null,
    peggingBoundaryBlocked: false,
    selfPlayUnresolved: false,
    ...overrides,
  };
}

describe('Cribbage active-hand snapshot store', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearCribbageActiveHandSnapshot();
    clearCribbageForensicTrace();
    vi.restoreAllMocks();
  });

  it('captures the live discard hit target and bounded forensic tail', () => {
    document.body.innerHTML = `
      <div data-crib-active-hand-stage>
        <button data-cribbage-hand-card-key="a"></button>
      </div>
      <button data-authoritative-action-surface="cribbage-discard">Send to Crib</button>
    `;
    const discard = document.querySelector(
      '[data-authoritative-action-surface="cribbage-discard"]',
    ) as HTMLButtonElement;
    vi.spyOn(discard, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 60,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [discard, document.body],
    });

    setCribbageForensicIdentity({ gameId: 'game-a', roundId: 'round-a' });
    recordCribbageForensicEvent('interaction', 'discard-visible', { disabled: false }, {
      producerComponent: 'CribbageMobileCardsTab',
      producerFunction: 'test',
    });
    publishCribbageActiveHandSnapshot(makeSnapshot());

    expect(captureCribbageActiveHandSnapshot('another-game')).toBeNull();
    expect(captureCribbageActiveHandSnapshot('game-a', 'dealer-b')).toBeNull();
    const captured = captureCribbageActiveHandSnapshot('game-a', 'dealer-a');
    expect(captured).toMatchObject({
      mountedAtCapture: true,
      activeHandDomCardCount: 1,
      unexpectedAuthoritativeCardsButEmptyDom: false,
      discardControl: {
        present: true,
        disabled: false,
        coveredAtCenter: false,
        topElementAtCenter: {
          authoritativeActionSurface: 'cribbage-discard',
        },
      },
    });
    expect(captured?.forensicTail.at(-1)).toMatchObject({
      tag: 'discard-visible',
      identity: { gameId: 'game-a' },
    });
  });

  it('retains the same-game snapshot after subtree unmount', () => {
    publishCribbageActiveHandSnapshot(makeSnapshot());
    clearCribbageActiveHandSnapshot('game-a');

    expect(captureCribbageActiveHandSnapshot('game-a')).toMatchObject({
      mountedAtCapture: false,
      unmountedAt: expect.any(String),
    });
  });

  it('ignores a stale cleanup from an earlier dealer game', () => {
    publishCribbageActiveHandSnapshot(makeSnapshot({ dealerGameId: 'dealer-b' }));
    clearCribbageActiveHandSnapshot('game-a', 'dealer-a');

    expect(captureCribbageActiveHandSnapshot('game-a', 'dealer-b')).toMatchObject({
      mountedAtCapture: true,
      dealerGameId: 'dealer-b',
    });
  });

  it('does not classify an empty DOM as contradictory during incremental dealing', () => {
    publishCribbageActiveHandSnapshot(makeSnapshot({
      dealPhase: 'DEALING',
      renderedHandCount: 0,
      presentationHandCount: 0,
      clippedHandCount: 0,
    }));

    expect(captureCribbageActiveHandSnapshot('game-a')).toMatchObject({
      activeHandDomCardCount: 0,
      unexpectedAuthoritativeCardsButEmptyDom: false,
    });
  });

  it('suppresses expected partial-deal mismatch and reports post-deal mismatch', () => {
    const base = {
      authoritativeCardIds: ['Ah', '2h'],
      renderedCardIds: ['Ah'],
      activeHandBlocked: false,
      cribbagePhase: 'discarding',
      renderHandKey: 'hand-a',
      currentHandKey: 'hand-a',
    };

    expect(isUnexpectedCribbageRenderSourceMismatch({
      ...base,
      dealPhase: 'DEALING',
    })).toBe(false);
    expect(isUnexpectedCribbageRenderSourceMismatch({
      ...base,
      dealPhase: 'GAMEPLAY',
    })).toBe(true);
  });
});
