import { describe, expect, it } from 'vitest';

import {
  buildContinuousObserverEvidence,
  continuousObserverFailure,
  type ChaosActionClick,
  type ChaosDomSnapshot,
  type ChaosNetworkReceipt,
  type ChaosObserverEvent,
  type ChaosViolation,
} from './continuousObserver';

function snapshot(
  client: 'host' | 'peer',
  wallTime: number,
  progressSignature: string,
  overrides: Partial<ChaosDomSnapshot> = {},
): ChaosDomSnapshot {
  return {
    kind: 'snapshot',
    client,
    wallTime,
    performanceTime: wallTime,
    url: 'https://holm357.com/game/example',
    gameId: 'game-1',
    gameStatus: 'in_progress',
    gameType: 'gin-rummy',
    dealerGameId: 'dealer-1',
    roundId: 'round-1',
    roundStatus: 'playing',
    shellCount: 1,
    feltCount: 1,
    nestedShellCount: 0,
    actionSurfaces: [],
    visibleTimerCount: 0,
    visibleFaceCardIds: [],
    opponentCardBackCounts: [],
    maskedVisibleFaceCardIds: [],
    staleArtifactKeys: [],
    announcement: null,
    setupStep: null,
    setupZ: null,
    tabRailZ: 40,
    sweepZ: null,
    flyingCardCount: 0,
    highCardCount: 0,
    progressSignature,
    snapshotSignature: `${progressSignature}:snapshot`,
    ...overrides,
  };
}

describe('continuous human-chaos observer evidence', () => {
  it('correlates a browser action with its RPC and both clients progress', () => {
    const action: ChaosActionClick = {
      kind: 'action-click',
      client: 'host',
      wallTime: 1_000,
      performanceTime: 100,
      url: 'https://holm357.com/game/example',
      actionId: 'host-action-1',
      actionSurface: 'gin-human-turn:discard',
      buttonText: 'Knock!',
      expectedPeerDelayReason: null,
      baselineProgressSignature: 'host-before',
      gameId: 'game-1',
      dealerGameId: 'dealer-1',
      roundId: 'round-1',
    };
    const events: ChaosObserverEvent[] = [
      snapshot('host', 900, 'host-before'),
      snapshot('peer', 900, 'peer-before'),
      action,
      snapshot('host', 1_350, 'host-after'),
      snapshot('peer', 1_900, 'peer-after'),
    ];
    const requests: ChaosNetworkReceipt[] = [{
      requestId: 'host-preflight-1',
      client: 'host',
      method: 'POST',
      endpoint: '/rest/v1/rpc/gin_rummy_get_state',
      startedAt: 1_010,
      finishedAt: 1_090,
      durationMs: 80,
      outcome: 'finished',
      failure: null,
    }, {
      requestId: 'host-request-1',
      client: 'host',
      method: 'POST',
      endpoint: '/rest/v1/rpc/gin_rummy_apply_action',
      startedAt: 1_050,
      finishedAt: 1_500,
      durationMs: 450,
      outcome: 'finished',
      failure: null,
    }];

    const evidence = buildContinuousObserverEvidence(events, requests, {
      startedAt: 800,
      finishedAt: 2_000,
      peerBudgetMs: 2_000,
    });

    expect(evidence.actionReceipts).toEqual([expect.objectContaining({
      actionId: 'host-action-1',
      rpcEndpoint: '/rest/v1/rpc/gin_rummy_apply_action',
      rpcDurationMs: 450,
      actorProgressMs: 350,
      peerProgressMs: 900,
    })]);
    expect(evidence.latency.rpc).toEqual(expect.objectContaining({ count: 1, p95Ms: 450 }));
    expect(evidence.latency.peerProgress).toEqual(expect.objectContaining({ count: 1, p95Ms: 900 }));
    expect(evidence.latency.peerBudgetBreaches).toEqual([]);
    expect(continuousObserverFailure(evidence)).toBeNull();
  });

  it('retains transient violations and makes configured peer latency fail closed', () => {
    const violation: ChaosViolation = {
      kind: 'violation',
      client: 'peer',
      wallTime: 1_200,
      performanceTime: 200,
      url: 'https://holm357.com/game/example',
      code: 'masked-visible-card-face',
      message: 'A masked card became visible.',
      durationMs: 0,
      details: { cardIds: ['?-?'] },
    };
    const action: ChaosActionClick = {
      kind: 'action-click',
      client: 'host',
      wallTime: 1_000,
      performanceTime: 100,
      url: 'https://holm357.com/game/example',
      actionId: 'slow-action',
      actionSurface: 'holm-357-decision',
      buttonText: 'Stay',
      expectedPeerDelayReason: null,
      baselineProgressSignature: 'host-before',
      gameId: 'game-1',
      dealerGameId: 'dealer-1',
      roundId: 'round-1',
    };
    const evidence = buildContinuousObserverEvidence([
      snapshot('host', 900, 'host-before'),
      snapshot('peer', 900, 'peer-before'),
      action,
      violation,
      snapshot('host', 1_100, 'host-after'),
      snapshot('peer', 4_500, 'peer-after'),
    ], [], { peerBudgetMs: 2_000 });

    expect(evidence.violations).toEqual([violation]);
    expect(evidence.latency.peerBudgetBreaches).toEqual(['slow-action']);
    expect(continuousObserverFailure(evidence)?.message).toContain('masked-visible-card-face');
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-latency:slow-action');
  });

  it('records a deliberate request-timeout delay without treating it as organic peer latency', () => {
    const action: ChaosActionClick = {
      kind: 'action-click',
      client: 'host',
      wallTime: 1_000,
      performanceTime: 100,
      url: 'https://holm357.com/game/example',
      actionId: 'expected-timeout-action',
      actionSurface: 'gin-pile',
      buttonText: '',
      expectedPeerDelayReason: 'gin-action-request-timeout-retry',
      baselineProgressSignature: 'host-before',
      gameId: 'game-1',
      dealerGameId: 'dealer-1',
      roundId: 'round-1',
    };
    const evidence = buildContinuousObserverEvidence([
      snapshot('host', 900, 'host-before'),
      snapshot('peer', 900, 'peer-before'),
      action,
      snapshot('host', 1_100, 'host-after'),
      snapshot('peer', 12_500, 'peer-after'),
    ], [], { peerBudgetMs: 6_000 });

    expect(evidence.actionReceipts[0]).toEqual(expect.objectContaining({
      expectedPeerDelayReason: 'gin-action-request-timeout-retry',
      peerProgressMs: 11_500,
    }));
    expect(evidence.latency.expectedPeerDelayActionIds).toEqual(['expected-timeout-action']);
    expect(evidence.latency.peerBudgetBreaches).toEqual([]);
    expect(continuousObserverFailure(evidence)).toBeNull();
  });

  it('records dealer-game and round identity transitions independently per client', () => {
    const evidence = buildContinuousObserverEvidence([
      snapshot('host', 1_000, 'h1'),
      snapshot('peer', 1_000, 'p1'),
      snapshot('host', 2_000, 'h2', { dealerGameId: 'dealer-2', roundId: 'round-2' }),
      snapshot('peer', 2_100, 'p2', { dealerGameId: 'dealer-2', roundId: 'round-2' }),
    ], []);

    expect(evidence.identityTransitions).toEqual([
      expect.objectContaining({ client: 'host', fromDealerGameId: 'dealer-1', toDealerGameId: 'dealer-2' }),
      expect.objectContaining({ client: 'peer', fromRoundId: 'round-1', toRoundId: 'round-2' }),
    ]);
    expect(evidence.finalSnapshots.host?.dealerGameId).toBe('dealer-2');
    expect(evidence.finalSnapshots.peer?.roundId).toBe('round-2');
  });
});
