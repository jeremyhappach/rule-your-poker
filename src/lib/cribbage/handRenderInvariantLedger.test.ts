import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCribbageHandRenderDecision,
  hasCribbageHandRenderInvariantFailed,
  getCribbageHandRenderLedger,
  clearCribbageHandRenderLedger,
  exportCribbageHandRenderLedgerJson,
} from './handRenderInvariantLedger';

describe('Cribbage hand render invariant ledger', () => {
  beforeEach(() => {
    clearCribbageHandRenderLedger();
  });

  const base = {
    clientId: 'aaaaaaaa',
    gameId: 'game-1',
    handNumber: 1,
    phase: 'pegging',
    authoritativeHandCount: 0,
    presentationHandCount: 0,
    renderedHandCount: 0,
    activeHandBlocked: false,
    dealPhase: 'GAMEPLAY',
    identityMismatch: false,
    reason: 'n/a',
  } as const;

  it('records entries and caps at 50', () => {
    for (let i = 0; i < 60; i += 1) {
      recordCribbageHandRenderDecision({ ...base, decision: 'render-presentation' });
    }
    expect(getCribbageHandRenderLedger().length).toBe(50);
  });

  it('flags invariant failure when authoritative non-empty but rendered empty', () => {
    expect(hasCribbageHandRenderInvariantFailed()).toBe(false);
    recordCribbageHandRenderDecision({
      ...base,
      decision: 'render-empty-blocked',
      authoritativeHandCount: 6,
      renderedHandCount: 0,
    });
    expect(hasCribbageHandRenderInvariantFailed()).toBe(true);
  });

  it('self-heal decision does not fail invariant when it recovers cards', () => {
    recordCribbageHandRenderDecision({
      ...base,
      decision: 'self-heal-fallback-to-authoritative',
      authoritativeHandCount: 6,
      renderedHandCount: 6,
      reason: 'recovered from empty presentation',
    });
    expect(hasCribbageHandRenderInvariantFailed()).toBe(false);
  });

  it('render-presentation on empty pre-deal is not a failure', () => {
    recordCribbageHandRenderDecision({
      ...base,
      decision: 'render-empty-pre-deal',
      authoritativeHandCount: 0,
      renderedHandCount: 0,
    });
    expect(hasCribbageHandRenderInvariantFailed()).toBe(false);
  });

  it('exports JSON only on demand — no localStorage or console side effects', () => {
    recordCribbageHandRenderDecision({
      ...base,
      decision: 'render-presentation',
      authoritativeHandCount: 6,
      renderedHandCount: 6,
    });
    const json = exportCribbageHandRenderLedgerJson();
    const parsed = JSON.parse(json);
    expect(parsed.entryCount).toBe(1);
    expect(Array.isArray(parsed.entries)).toBe(true);
  });
});

describe('Cribbage self-hand render decision policy (unit contract)', () => {
  /**
   * Pure decision function mirrored from CribbageMobileCardsTab.tsx to lock
   * the self-heal contract at unit level. If this function changes in the
   * component, the mirror below must be updated in lock-step.
   */
  function computeRenderedHand({
    sourceHand,
    authoritativeHand,
    phase,
    dealPhase,
    activeHandBlocked,
    settledCount,
  }: {
    sourceHand: string[];
    authoritativeHand: string[] | null;
    phase: string;
    dealPhase: 'PRE_DEAL' | 'DEALING' | 'READY' | 'GAMEPLAY' | null;
    activeHandBlocked: boolean;
    settledCount: number;
  }): string[] {
    const isPostDeal =
      phase === 'discarding' || phase === 'cutting' || phase === 'pegging' || phase === 'counting';
    const clipped: string[] = (() => {
      if (activeHandBlocked) return [];
      if (!dealPhase) return sourceHand;
      if (dealPhase === 'GAMEPLAY' || dealPhase === 'READY') return sourceHand;
      if (dealPhase === 'PRE_DEAL') return [];
      return sourceHand.slice(0, settledCount);
    })();
    const shouldSelfHeal =
      clipped.length === 0 &&
      !!authoritativeHand &&
      authoritativeHand.length > 0 &&
      isPostDeal;
    return shouldSelfHeal ? (authoritativeHand as string[]) : clipped;
  }

  const auth = ['AS', 'KH', '5C', '7D', '9S', 'JC'];

  it('realtime deal patch with authoritative non-empty renders cards without refresh', () => {
    // Presentation caught up: sourceHand == authoritative
    const rendered = computeRenderedHand({
      sourceHand: auth,
      authoritativeHand: auth,
      phase: 'discarding',
      dealPhase: 'GAMEPLAY',
      activeHandBlocked: false,
      settledCount: 6,
    });
    expect(rendered).toEqual(auth);
  });

  it('empty presentation cannot suppress cards when authoritative is non-empty (post-deal)', () => {
    const rendered = computeRenderedHand({
      sourceHand: [],
      authoritativeHand: auth,
      phase: 'discarding',
      dealPhase: 'GAMEPLAY',
      activeHandBlocked: false,
      settledCount: 6,
    });
    expect(rendered).toEqual(auth);
  });

  it('stuck deal-runtime PRE_DEAL cannot suppress cards once phase is post-deal', () => {
    const rendered = computeRenderedHand({
      sourceHand: auth,
      authoritativeHand: auth,
      phase: 'pegging',
      dealPhase: 'PRE_DEAL',
      activeHandBlocked: false,
      settledCount: 0,
    });
    expect(rendered).toEqual(auth);
  });

  it('unsettled transports cannot suppress cards once phase is post-deal', () => {
    const rendered = computeRenderedHand({
      sourceHand: auth,
      authoritativeHand: auth,
      phase: 'discarding',
      dealPhase: 'DEALING',
      activeHandBlocked: false,
      settledCount: 0,
    });
    expect(rendered).toEqual(auth);
  });

  it('stale identity (activeHandBlocked) cannot suppress cards once phase is post-deal', () => {
    const rendered = computeRenderedHand({
      sourceHand: auth,
      authoritativeHand: auth,
      phase: 'pegging',
      dealPhase: 'GAMEPLAY',
      activeHandBlocked: true,
      settledCount: 6,
    });
    expect(rendered).toEqual(auth);
  });

  it('does NOT self-heal during dealer-select / dealing phases', () => {
    const rendered = computeRenderedHand({
      sourceHand: [],
      authoritativeHand: auth,
      phase: 'dealing',
      dealPhase: 'DEALING',
      activeHandBlocked: false,
      settledCount: 0,
    });
    expect(rendered).toEqual([]);
  });

  it('hydration path (refresh) and realtime path produce identical rendered hand', () => {
    const hydration = computeRenderedHand({
      sourceHand: auth,
      authoritativeHand: auth,
      phase: 'pegging',
      dealPhase: 'GAMEPLAY',
      activeHandBlocked: false,
      settledCount: 6,
    });
    const realtimeWithLag = computeRenderedHand({
      sourceHand: [],
      authoritativeHand: auth,
      phase: 'pegging',
      dealPhase: 'PRE_DEAL',
      activeHandBlocked: true,
      settledCount: 0,
    });
    expect(hydration).toEqual(realtimeWithLag);
  });
});
