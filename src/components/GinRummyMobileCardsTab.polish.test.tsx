// @ts-nocheck
// Polish contract: Gin per-hand visual selection state is lifted above
// the disposable Cards tab. Source-level asserts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(__dirname, 'GinRummyMobileCardsTab.tsx'),
  'utf-8'
);
const gameTableSrc = readFileSync(
  join(__dirname, 'GinRummyGameTable.tsx'),
  'utf-8'
);
const chatSrc = readFileSync(
  join(__dirname, 'MobileChatPanel.tsx'),
  'utf-8'
);

describe('Gin cards-tab visual selection ownership (polish)', () => {
  it('selectedCardIndex is a prop, not local useState in the tab', () => {
    expect(src).toMatch(/selectedCardIndex:\s*number\s*\|\s*null/);
    expect(src).toMatch(/onSelectedCardIndexChange/);
    expect(src).not.toMatch(/useState<number \| null>\(null\)/);
  });

  it('drawnCard is a prop, not local useState in the tab', () => {
    expect(src).toMatch(/drawnCard:\s*\{[^}]*rank[^}]*suit[^}]*\}\s*\|\s*null/);
    expect(src).toMatch(/onDrawnCardChange/);
    expect(src).not.toMatch(/useState<\{ rank: string; suit: string \} \| null>/);
  });

  it('phase-transition reset is guarded by a prev-phase ref (not fired on remount)', () => {
    expect(src).toMatch(/prevPhaseRef/);
    expect(src).toMatch(/prevPhaseRef\.current\s*!==\s*ginState\.phase/);
  });

  it('validates selection against the rendered hand and drawnCard against the full caller hand', () => {
    expect(src).toMatch(/!myState\.hand\[selectedCardIndex\]/);
    expect(src).toMatch(/!stableMyStateAuthoritative\.hand\.some\(c\s*=>\s*c\.rank\s*===\s*drawnCard\.rank/);
    expect(src).toMatch(/!isGinMaskedCard\(lastAct\.card\)/);
  });

  it('successful discard/knock/layoff still clear selection', () => {
    // handleDiscard clears
    expect(src).toMatch(/onDiscard\(selectedCardIndex,\s*sourceRect\);\s*setSelectedCardIndex\(null\)/);
    // handleKnock clears
    expect(src).toMatch(/onKnock\(selectedCardIndex\);\s*setSelectedCardIndex\(null\)/);
    // handleLayOff clears
    expect(src).toMatch(/onLayOff\(selectedCardIndex,[^)]+\);\s*onLayOffCardSelected\?\.\(null\);\s*setSelectedCardIndex\(null\)/);
  });

  it('felt-target layoffs clear both lifted layoff and hand-card selection', () => {
    expect(gameTableSrc).toMatch(
      /onLayOffToMeld=\{\(meldIndex\)\s*=>\s*\{[\s\S]*?handleLayOff\(layOffSelectedCardIndex,\s*meldIndex\);\s*setLayOffSelectedCardIndex\(null\);\s*setSelectedCardIndex\(null\)/
    );
  });

  it('renders a landed unresolved draw as a disabled canonical card back', () => {
    expect(src).toMatch(/pendingDrawPlaceholderCount/);
    expect(src).toMatch(/data-gin-pending-draw-authority/);
    expect(src).toMatch(/disabled=\{isPendingAuthority \|\| isProcessing/);
    expect(src).toMatch(/<CanonicalCardBack[\s\S]*?data-gin-pending-draw-card/);
    expect(gameTableSrc).toMatch(
      /pendingDrawPlaceholderCount=\{Object\.values\(selfDrawIntents\)[\s\S]*?animationSettled && !intent\.authoritativeCardReady/,
    );
  });
});

describe('Chat input helper/status text (polish)', () => {
  it('does not render a transient "Finalizing transcription…" helper line', () => {
    expect(chatSrc).not.toMatch(/Finalizing transcription…/);
  });

  it('does not render a voice diagnostics helper line under the input', () => {
    expect(chatSrc).not.toMatch(/voice\.diagnostics\.length\s*>\s*0/);
  });

  it('keeps error and permission-denied surfaces (real failure conditions)', () => {
    expect(chatSrc).toMatch(/voice\.state === 'error'/);
    expect(chatSrc).toMatch(/voice\.permission === 'denied'/);
  });
});
