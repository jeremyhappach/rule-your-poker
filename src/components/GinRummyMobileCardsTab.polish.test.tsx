// Polish contract: Gin per-hand visual selection state is lifted above
// the disposable Cards tab. We assert the contract statically by scanning
// the source file: (1) selectedCardIndex/drawnCard are props, not local
// useState in this component; (2) reset is gated by prevPhaseRef so a
// tab remount does not clear selection; (3) selectedCardIndex is validated
// against the current hand so stale indexes don't render highlights;
// (4) successful discard/knock/layoff still clear selection.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(
  join(__dirname, 'GinRummyMobileCardsTab.tsx'),
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

  it('validates lifted selection/drawnCard against current hand', () => {
    expect(src).toMatch(/!myState\.hand\[selectedCardIndex\]/);
    expect(src).toMatch(/!myState\.hand\.some\(c\s*=>\s*c\.rank\s*===\s*drawnCard\.rank/);
  });

  it('successful discard/knock/layoff still clear selection', () => {
    // handleDiscard clears
    expect(src).toMatch(/onDiscard\(selectedCardIndex\);\s*setSelectedCardIndex\(null\)/);
    // handleKnock clears
    expect(src).toMatch(/onKnock\(selectedCardIndex\);\s*setSelectedCardIndex\(null\)/);
    // handleLayOff clears
    expect(src).toMatch(/onLayOff\(selectedCardIndex,[^)]+\);\s*onLayOffCardSelected\?\.\(null\);\s*setSelectedCardIndex\(null\)/);
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
