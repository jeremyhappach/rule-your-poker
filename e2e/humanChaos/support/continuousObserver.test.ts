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
    roundStatus: progressSignature,
    shellCount: 1,
    feltCount: 1,
    nestedShellCount: 0,
    actionSurfaces: [],
    visibleTimerCount: 0,
    visibleFaceCardIds: [],
    opponentCardBackCounts: [],
    visibleDice: [],
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
  const action = (overrides: Partial<ChaosActionClick> = {}): ChaosActionClick => ({
    kind: 'action-click', client: 'host', wallTime: 1_000, performanceTime: 100,
    url: 'https://example.invalid/game/1', actionId: 'progress-required',
    actionSurface: 'gin-human-turn:discard', buttonText: 'Discard',
    expectedPeerDelayReason: null, baselineProgressSignature: 'before',
    gameId: 'game-1', dealerGameId: 'dealer-1', roundId: 'round-1', ...overrides,
  });
  const baselines = () => [snapshot('host', 900, 'before'), snapshot('peer', 900, 'before')];

  it.each(['horses', 'ship-captain-crew'])('recognizes %s roll progression without DOM dice on the acting seat', (gameType) => {
    const diceSnapshot = (client: 'host' | 'peer', time: number, roll: number, disabled = false) =>
      snapshot(client, time, 'betting', { gameType,
        actionSurfaces: [`horses-scc-turn[Roll ${roll}:${disabled ? 'disabled' : 'enabled'}]`],
      });
    const evidence = buildContinuousObserverEvidence([
      diceSnapshot('host', 900, 1), diceSnapshot('peer', 900, 1),
      action({ actionSurface: 'horses-scc-turn', buttonText: 'Roll 1' }),
      diceSnapshot('host', 1_050, 1, true),
      diceSnapshot('host', 1_721, 2, true), diceSnapshot('peer', 1_937, 2),
    ], [], { finishedAt: 3_000, peerBudgetMs: 2_000 });
    expect(evidence.actionReceipts[0].actorProgressMs).toBe(721);
    expect(evidence.actionReceipts[0].peerProgressMs).toBe(937);
    expect(continuousObserverFailure(evidence)).toBeNull();
  });

  it('does not treat dice button availability or unrelated roll labels as a completed roll', () => {
    const base = { gameType: 'horses', actionSurfaces: ['horses-scc-turn[Roll 1:enabled]'] };
    const evidence = buildContinuousObserverEvidence([
      snapshot('host', 900, 'betting', base), snapshot('peer', 900, 'betting', base),
      action({ actionSurface: 'horses-scc-turn', buttonText: 'Roll 1' }),
      snapshot('host', 1_050, 'betting', { ...base, actionSurfaces: ['horses-scc-turn[Roll 1:disabled]'] }),
      snapshot('peer', 1_721, 'betting', { ...base, actionSurfaces: ['horses-scc-turn[Roll 1:enabled]', 'unrelated[Roll 2:enabled]'] }),
    ], [], { finishedAt: 20_000, peerBudgetMs: 2_000 });
    expect(evidence.actionReceipts[0].actorProgressMs).toBeNull();
    expect(evidence.actionReceipts[0].peerProgressMs).toBeNull();
    expect(continuousObserverFailure(evidence)).not.toBeNull();
  });

  it('fails when the actor advances but its seated peer never does', () => {
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action(), snapshot('host', 1_300, 'after'), snapshot('peer', 20_000, 'before'),
    ], [], { finishedAt: 20_000, peerBudgetMs: 2_000 });
    expect(evidence.actionReceipts[0].peerProgressMs).toBeNull();
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-no-progress:progress-required');
  });

  it('does not count announcement, animation or button-disable churn as gameplay progress', () => {
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action(), snapshot('host', 1_300, 'after'),
      snapshot('peer', 1_400, 'cosmetic', {
        roundStatus: 'before', announcement: 'New announcement', flyingCardCount: 2,
        actionSurfaces: ['gin-human-turn:discard[Discard:disabled]'],
      }),
    ], [], { finishedAt: 20_000, peerBudgetMs: 2_000 });
    expect(evidence.actionReceipts[0].peerProgressMs).toBeNull();
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-no-progress');
  });

  it('rejects progress from a different session', () => {
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action(), snapshot('host', 1_300, 'after'),
      snapshot('peer', 1_400, 'after', { gameId: 'other-session' }),
    ], [], { finishedAt: 20_000, peerBudgetMs: 2_000 });
    expect(evidence.actionReceipts[0].peerProgressMs).toBeNull();
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-no-progress');
  });

  it('fails missing peer evidence instead of treating an empty capture as success', () => {
    const evidence = buildContinuousObserverEvidence([
      snapshot('host', 900, 'before'), action(), snapshot('host', 1_300, 'after'),
    ], [], { finishedAt: 20_000, peerBudgetMs: 2_000 });
    expect(continuousObserverFailure(evidence)?.message).toContain('missing-client-evidence:peer');
  });

  it('reports an observation ending before required progress as incomplete', () => {
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action(), snapshot('host', 1_300, 'after'),
    ], [], { finishedAt: 1_500, peerBudgetMs: 2_000 });
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-incomplete:progress-required');
  });

  it('cannot exempt a permanently stuck peer with a fault-schedule label', () => {
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action({ expectedPeerDelayReason: 'lost-response-retry' }),
      snapshot('host', 1_300, 'after'),
    ], [], { finishedAt: 60_000, peerBudgetMs: 2_000 });
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-no-progress');
  });

  it('preserves explicit local-only and private-action contracts with retained reasons', () => {
    for (const progressExpectation of ['none', 'actor'] as const) {
      const evidence = buildContinuousObserverEvidence([
        ...baselines(), action({ progressExpectation, progressExemptionReason: 'declared local/private action' }),
        snapshot('host', 1_300, 'after'),
      ], [], { finishedAt: 20_000 });
      expect(continuousObserverFailure(evidence)).toBeNull();
      expect(evidence.actionReceipts[0].progressExemptionReason).toBe('declared local/private action');
    }
  });

  it('rejects unexplained exemptions and malformed fault budgets', () => {
    for (const overrides of [
      { progressExpectation: 'none' as const },
      { expectedPeerDelayMs: -1, expectedPeerDelayReason: 'retry' },
      { expectedPeerDelayMs: 20_000 },
    ]) {
      const evidence = buildContinuousObserverEvidence([
        ...baselines(), action(overrides), snapshot('host', 1_300, 'after'), snapshot('peer', 1_400, 'after'),
      ], [], { finishedAt: 20_000 });
      expect(continuousObserverFailure(evidence)).not.toBeNull();
    }
  });

  it('requires a declared successor identity when the scenario supplies one', () => {
    const request = action({ expectedIdentity: { gameId: 'game-1', dealerGameId: 'dealer-2', roundId: 'round-2' } });
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), request, snapshot('host', 1_300, 'after'), snapshot('peer', 1_400, 'after'),
    ], [], { finishedAt: 20_000 });
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-no-progress');
    const correct = buildContinuousObserverEvidence([
      ...baselines(), request,
      snapshot('host', 1_300, 'after', { dealerGameId: 'dealer-2', roundId: 'round-2' }),
      snapshot('peer', 1_400, 'after', { dealerGameId: 'dealer-2', roundId: 'round-2' }),
    ], [], { finishedAt: 20_000 });
    expect(continuousObserverFailure(correct)).toBeNull();
  });

  it('does not use a later action to rescue an earlier stalled action', () => {
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action(), snapshot('host', 1_300, 'after'),
      action({ actionId: 'later-action', wallTime: 2_000 }),
      snapshot('host', 2_300, 'later'), snapshot('peer', 2_400, 'later'),
    ], [], { finishedAt: 20_000, peerBudgetMs: 2_000 });
    expect(evidence.actionReceipts[0].peerProgressMs).toBeNull();
    expect(continuousObserverFailure(evidence)?.message).toContain('peer-incomplete:progress-required');
    expect(evidence.actionReceipts[1].progressProblems).toEqual([]);
  });

  it('retains a response-loss retry and accepts eventual progress within the declared recovery budget', () => {
    const requests: ChaosNetworkReceipt[] = ['failed', 'finished'].map((outcome, index) => ({
      requestId: `attempt-${index}`, client: 'host', method: 'POST', endpoint: '/rest/v1/rpc/gin_rummy_apply_action',
      startedAt: 1_050 + index * 3_000, finishedAt: 1_500 + index * 3_000, durationMs: 450,
      outcome: outcome as 'failed' | 'finished', failure: index === 0 ? 'response lost' : null,
    }));
    const evidence = buildContinuousObserverEvidence([
      ...baselines(), action({ expectedPeerDelayReason: 'lost response', expectedPeerDelayMs: 6_000 }),
      snapshot('host', 4_600, 'after'), snapshot('peer', 4_700, 'after'),
    ], requests, { finishedAt: 8_000, peerBudgetMs: 2_000 });
    expect(continuousObserverFailure(evidence)).toBeNull();
    expect(evidence.networkRequests).toHaveLength(2);
  });

  it('fails when capture truncation makes coverage incomplete', () => {
    const evidence = buildContinuousObserverEvidence(baselines(), [], { captureProblems: ['event-capture-truncated'] });
    expect(continuousObserverFailure(evidence)?.message).toContain('event-capture-truncated');
  });

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
