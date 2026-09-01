import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canAdmitThreeFiveSevenTerminalPresentation,
  isThreeFiveSevenAuthoritativeFallbackReady,
  isThreeFiveSevenDealPresentationReady,
  isThreeFiveSevenRuntimeWaveReady,
  isThreeFiveSevenLegStackRetired,
  resolveThreeFiveSevenDealerGameScope,
  resolveThreeFiveSevenStaticLegCount,
  selectThreeFiveSevenExactWaveReceipts,
  type ThreeFiveSevenDealReadinessToken,
} from './presentationReadiness';

describe('3-5-7 deal presentation readiness', () => {
  const priorHandReady: ThreeFiveSevenDealReadinessToken = {
    handContextId: 'dealer-game-1#h1',
    waveContextId: 'dealer-game-1#h1#r1',
    roundId: 'round-1',
    roundNumber: 1,
    allowed: true,
  };

  const expectedR2 = {
    handContextId: 'dealer-game-1#h2',
    waveContextId: 'dealer-game-1#h2#r2',
    roundId: 'round-2',
    roundNumber: 2,
  };

  it('rejects a ready token inherited from the prior hand', () => {
    expect(isThreeFiveSevenDealPresentationReady(expectedR2, priorHandReady)).toBe(false);
  });

  it('rejects an R1 token when R2 publishes within the same hand', () => {
    expect(isThreeFiveSevenDealPresentationReady(expectedR2, {
      handContextId: 'dealer-game-1#h2',
      waveContextId: 'dealer-game-1#h2#r1',
      roundId: 'round-1',
      roundNumber: 1,
      allowed: true,
    })).toBe(false);
  });

  it('keeps a live R2 blocked until all ten two-player card intents settle', () => {
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: true,
      runtimeExpectedCount: 6,
      expectedCumulativeCount: 10,
      historicalEntry: false,
    })).toBe(false);
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: true,
      runtimeExpectedCount: 10,
      expectedCumulativeCount: 10,
      historicalEntry: false,
    })).toBe(true);
  });

  it('admits controls and timer only for the exact settled wave', () => {
    expect(isThreeFiveSevenDealPresentationReady(expectedR2, {
      ...expectedR2,
      handContextId: expectedR2.handContextId!,
      waveContextId: expectedR2.waveContextId!,
      roundId: expectedR2.roundId!,
      roundNumber: expectedR2.roundNumber!,
      allowed: true,
    })).toBe(true);
  });

  it('rebuilds an R2 presentation from the authoritative baseline plus only exact-wave receipts', () => {
    const receipts = selectThreeFiveSevenExactWaveReceipts({
      waveContextId: 'dealer-game-1#h1#r2',
      receipts: [
        { cardId: 'dealer-game-1#h1#r1#card-0' },
        { cardId: 'dealer-game-1#h1#r2#card-0' },
        { cardId: 'dealer-game-1#h1#r2#card-2' },
        { cardId: 'dealer-game-1#h1#r3#card-0' },
      ],
      expectedWaveCount: 2,
    });

    expect(receipts.map((receipt) => receipt.cardId)).toEqual([
      'dealer-game-1#h1#r2#card-0',
      'dealer-game-1#h1#r2#card-2',
    ]);
    expect(3 + receipts.length).toBe(5);
  });

  it('does not require prior-wave receipt survival to retain the R3 five-card baseline', () => {
    const receipts = selectThreeFiveSevenExactWaveReceipts({
      waveContextId: 'dealer-game-1#h1#r3',
      receipts: [
        { cardId: 'dealer-game-1#h1#r3#card-1' },
        { cardId: 'dealer-game-1#h1#r3#card-3' },
      ],
      expectedWaveCount: 2,
    });

    expect(5 + receipts.length).toBe(7);
  });

  it('keeps the route as the single readiness-token owner for timer and actions', () => {
    const routeSource = readFileSync(new URL('../../pages/Game.tsx', import.meta.url), 'utf8');
    const tableSource = readFileSync(
      new URL('../../components/MobileGameTable.tsx', import.meta.url),
      'utf8',
    );

    expect(routeSource).toContain('useState<ThreeFiveSevenDealReadinessToken | null>(null)');
    expect(routeSource).toContain('dealReadiness357={dealReadiness357}');
    expect(tableSource).not.toContain('reportedThreeFiveSevenDealReadiness');
    expect(tableSource).toContain('onAllowedChange={on357TimerAllowedChange}');
    expect(tableSource).toContain('dealReadiness357,');
    expect(routeSource).toContain('dealReadiness357={dealReadiness357}');
    const orchestratorSource = readFileSync(
      new URL('../../components/ThreeFiveSevenDealOrchestrator.tsx', import.meta.url),
      'utf8',
    );
    expect(orchestratorSource).toContain('length: Math.max(0, effectiveCards.length)');
  });

  it('recovers a live exact hand only after the exact transport wave becomes inactive with a missing receipt', () => {
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      historicalEntry: false,
      gameStatus: 'in_progress',
      roundStatus: 'betting',
      handContextId: 'dealer-game-1#h1',
      waveContextId: 'dealer-game-1#h1#r1',
      roundId: 'round-1',
      roundNumber: 1,
      authoritativeSelfCardCount: 3,
      expectedSelfCardCount: 3,
      runtimePhase: 'DEALING',
      runtimeExpectedCount: 6,
      expectedCumulativeCount: 6,
      runtimeSettledCount: 5,
      runtimeActiveIntentCount: 0,
      transportObservedForWave: true,
    })).toBe(true);
  });

  it('never treats an authoritative PRE_DEAL hand or active wave as a presentation receipt', () => {
    const exactLiveHand = {
      historicalEntry: false,
      gameStatus: 'in_progress',
      roundStatus: 'betting',
      handContextId: 'dealer-game-1#h1',
      waveContextId: 'dealer-game-1#h1#r1',
      roundId: 'round-1',
      roundNumber: 1,
      authoritativeSelfCardCount: 3,
      expectedSelfCardCount: 3,
      runtimeExpectedCount: 6,
      expectedCumulativeCount: 6,
      runtimeSettledCount: 0,
      runtimeActiveIntentCount: 0,
      transportObservedForWave: false,
    };

    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      runtimePhase: 'PRE_DEAL',
    })).toBe(false);
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      runtimePhase: 'DEALING',
      runtimeActiveIntentCount: 6,
      transportObservedForWave: true,
    })).toBe(false);
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      runtimePhase: 'DEALING',
    })).toBe(false);
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      runtimePhase: 'DEALING',
      runtimeExpectedCount: 0,
      transportObservedForWave: true,
    })).toBe(false);
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      runtimePhase: 'DEALING',
      runtimeSettledCount: 6,
      transportObservedForWave: true,
    })).toBe(false);
  });

  it('wires fallback admission through the exact wave transport lifecycle reporter', () => {
    const source = readFileSync(
      new URL('../../components/MobileGameTable.tsx', import.meta.url),
      'utf8',
    );
    const reporter = source.slice(
      source.indexOf('function ThreeFiveSevenTimerGateReporter({'),
      source.indexOf('function resolveCanonicalFeltKind('),
    );

    expect(reporter).toContain('deal.activeIntentsForHand <= 0');
    expect(reporter).toContain('runtimePhase: deal?.phase');
    expect(reporter).toContain('runtimeSettledCount: deal?.settledCardIds.size ?? 0');
    expect(reporter).toContain(
      'transportObservedForWave: transportObservedWaveContextId === waveContextId',
    );
  });

  it('keeps historical, incomplete, and non-betting state blocked from fallback recovery', () => {
    const exactLiveHand = {
      historicalEntry: false,
      gameStatus: 'in_progress',
      roundStatus: 'betting',
      handContextId: 'dealer-game-1#h1',
      waveContextId: 'dealer-game-1#h1#r1',
      roundId: 'round-1',
      roundNumber: 1,
      authoritativeSelfCardCount: 3,
      expectedSelfCardCount: 3,
      runtimePhase: 'DEALING',
      runtimeExpectedCount: 6,
      expectedCumulativeCount: 6,
      runtimeSettledCount: 5,
      runtimeActiveIntentCount: 0,
      transportObservedForWave: true,
    };

    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      historicalEntry: true,
    })).toBe(false);
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      authoritativeSelfCardCount: 2,
    })).toBe(false);
    expect(isThreeFiveSevenAuthoritativeFallbackReady({
      ...exactLiveHand,
      roundStatus: 'complete',
    })).toBe(false);
  });

  it('requires historical-entry reconstruction to publish its settled baseline', () => {
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: true,
      runtimeExpectedCount: 10,
      expectedCumulativeCount: 10,
      historicalEntry: true,
    })).toBe(true);
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: false,
      runtimeExpectedCount: 0,
      expectedCumulativeCount: 10,
      historicalEntry: true,
    })).toBe(false);
  });
});

describe('3-5-7 dealer-game presentation boundary', () => {
  it('uses the concrete authoritative dealer-game identity', () => {
    expect(resolveThreeFiveSevenDealerGameScope('dealer-game-2', null)).toBe('dealer-game-2');
  });

  it('preserves a null scope during the postgame handoff', () => {
    expect(resolveThreeFiveSevenDealerGameScope(null, undefined)).toBeNull();
  });

  it('keeps swept legs retired for the outgoing dealer game', () => {
    expect(isThreeFiveSevenLegStackRetired({
      activeDealerGameId: 'dealer-game-1',
      retiredDealerGameId: 'dealer-game-1',
    })).toBe(true);
  });

  it('keeps swept legs retired through the null handoff gap', () => {
    expect(isThreeFiveSevenLegStackRetired({
      activeDealerGameId: null,
      retiredDealerGameId: 'dealer-game-1',
    })).toBe(true);
  });

  it('releases the retired stack only for a different concrete dealer game', () => {
    expect(isThreeFiveSevenLegStackRetired({
      activeDealerGameId: 'dealer-game-2',
      retiredDealerGameId: 'dealer-game-1',
    })).toBe(false);
  });

  it('resumes an exact terminal presentation after a table remount in the null postgame handoff', () => {
    expect(canAdmitThreeFiveSevenTerminalPresentation({
      descriptorDealerGameId: 'dealer-game-1',
      activeDealerGameId: null,
      activeTriggerId: 'terminal-trigger-1',
    })).toBe(true);
  });

  it('does not replay a completed terminal presentation without its route-owned trigger', () => {
    expect(canAdmitThreeFiveSevenTerminalPresentation({
      descriptorDealerGameId: 'dealer-game-1',
      activeDealerGameId: null,
      activeTriggerId: null,
    })).toBe(false);
  });

  it('rejects a stale terminal presentation after the next concrete dealer game exists', () => {
    expect(canAdmitThreeFiveSevenTerminalPresentation({
      descriptorDealerGameId: 'dealer-game-1',
      activeDealerGameId: 'dealer-game-2',
      activeTriggerId: 'terminal-trigger-1',
    })).toBe(false);
  });

  it('wires null-handoff remount recovery into the normal terminal owner', () => {
    const source = readFileSync(
      new URL('../../components/MobileGameTable.tsx', import.meta.url),
      'utf8',
    );
    const normalTerminalOwner = source.slice(
      source.indexOf('// Normal 3-5-7 terminal prelude: descriptor generation owns the sequence.'),
      source.indexOf('// The old trigger no longer progresses a normal terminal sequence.'),
    );

    expect(normalTerminalOwner).toContain('canAdmitThreeFiveSevenTerminalPresentation({');
    expect(normalTerminalOwner).toContain('activeTriggerId: threeFiveSevenWinTriggerId');
    expect(normalTerminalOwner).toContain('const isNullHandoffRecovery = threeFiveSevenDealerGameScope == null');
    expect(normalTerminalOwner).not.toContain('if (!descriptor || isWaitingPhase) return;');
  });
});

describe('3-5-7 static leg presentation', () => {
  it('holds two earned legs while the terminal third leg is in flight', () => {
    expect(resolveThreeFiveSevenStaticLegCount({
      effectiveLegs: 2,
      isIncomingLegAnimating: true,
      isNormalTerminalFinalLegAward: true,
      legsToWin: 3,
    })).toBe(2);
  });

  it('continues withholding one incoming leg for ordinary leg awards', () => {
    expect(resolveThreeFiveSevenStaticLegCount({
      effectiveLegs: 2,
      isIncomingLegAnimating: true,
      isNormalTerminalFinalLegAward: false,
      legsToWin: 3,
    })).toBe(1);
  });

  it('clamps the terminal baseline to a configurable target', () => {
    expect(resolveThreeFiveSevenStaticLegCount({
      effectiveLegs: 4,
      isIncomingLegAnimating: true,
      isNormalTerminalFinalLegAward: true,
      legsToWin: 5,
    })).toBe(4);
  });
});
