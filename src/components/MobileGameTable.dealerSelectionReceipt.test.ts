import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'MobileGameTable.tsx'), 'utf8');

describe('session dealer-draw DOM receipt', () => {
  it('keeps cached draw cards out of the gameplay hand and scopes the winner spotlight', () => {
    const handPane = source.slice(source.indexOf('data-357-active-pane-content=""'));
    expect(handPane).not.toContain('dealerSelectionCards');
    expect(handPane).not.toContain('currentPlayerDealerCards');
    expect(source).toContain("!sessionEndedPhase && (gameStatus === 'dealer_selection' || dealerSelectionPresentationActive) && dealerSelectionWinnerPosition !== null");
    expect(source).toContain("dealerSelectionCards && dealerSelectionCards.length > 0 && (gameStatus === 'dealer_selection' || dealerSelectionPresentationActive) && highCardOverlayPortal(");
  });

  it('acknowledges a wave only after every expected card is mounted', () => {
    expect(source).toContain(
      "container.querySelectorAll('[data-dsel-card=\"1\"]').length === cardCount",
    );
    expect(source).not.toContain(
      "container.querySelector('[data-dsel-card=\"1\"]') !== null",
    );
  });
});
