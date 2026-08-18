// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import {
  CanonicalAnnouncementProvider,
  useAnnouncementContext,
  useAnnouncements,
} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import { CanonicalAnnouncementLayer } from '@/lib/canonicalShell/announcements/CanonicalAnnouncementLayer';
import { recordShellEvent } from '@/lib/canonicalShell/diagnostics';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import {
  useThreeFiveSevenFinancialAnnouncementOwner,
} from './financialAnnouncementOwner';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';

vi.mock('@/lib/canonicalShell/diagnostics', () => ({ recordShellEvent: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const tax: ThreeFiveSevenAllFoldPresentation = {
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-h1-r3',
  handNumber: 1,
  roundNumber: 3,
  transferCursor: 4,
};

const reAnte: ThreeFiveSevenRolloverPresentation = {
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-h2-r1',
  handNumber: 2,
  roundNumber: 1,
  transferCursor: 5,
};

const taxBatch: ChipPresentationBatch = {
  id: 'batch-tax-4',
  game_id: 'game-1',
  cursor: 4,
  reason: 'bet',
  transfers: [{
    id: 'transfer-tax-4',
    amount: 1,
    from: { kind: 'player', playerId: 'player-1' },
    to: { kind: 'pot' },
  }],
  opening_balances: { 'player:player-1': 10, pot: 2 },
  closing_balances: { 'player:player-1': 9, pot: 3 },
};

type OwnerApi = ReturnType<typeof useThreeFiveSevenFinancialAnnouncementOwner>;

let container: HTMLDivElement;
let root: Root;
let ownerApi: OwnerApi | null;

function Harness({
  pussyTax,
  rollover,
}: {
  pussyTax: ThreeFiveSevenAllFoldPresentation | null;
  rollover: ThreeFiveSevenRolloverPresentation | null;
}) {
  const announcements = useAnnouncements();
  const context = useAnnouncementContext();
  ownerApi = useThreeFiveSevenFinancialAnnouncementOwner({
    enabled: true,
    announcementGameId: 'game-1',
    dealerGameId: 'dealer-1',
    pussyTax,
    reAnte: rollover,
    emit: announcements.emit,
    retireTransientScope: announcements.retireTransientScope,
  });
  return (
    <>
      <CanonicalAnnouncementLayer />
      <output data-testid="active-announcement">{context?.active?.id ?? 'none'}</output>
    </>
  );
}

function renderOwner(
  pussyTax: ThreeFiveSevenAllFoldPresentation | null,
  rollover: ThreeFiveSevenRolloverPresentation | null,
) {
  root.render(
    <CanonicalAnnouncementProvider dealerGameId="game-1">
      <Harness pussyTax={pussyTax} rollover={rollover} />
    </CanonicalAnnouncementProvider>,
  );
}

beforeEach(() => {
  vi.mocked(recordShellEvent).mockClear();
  ownerApi = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('3-5-7 authoritative financial announcement owner', () => {
  it('paints Re-Ante once from authority even when no local batch starts', () => {
    act(() => { renderOwner(null, reAnte); });

    expect(container.textContent).toContain('Re-Ante');
    expect(container.querySelector('[data-testid="active-announcement"]')?.textContent)
      .toBe('peg:357-re-ante:game-1:dealer-1:round-h2-r1:2:5');

    act(() => { renderOwner(null, { ...reAnte }); });
    const dispositions = vi.mocked(recordShellEvent).mock.calls.filter(([, payload]) => (
      payload.detail?.stage === 'disposition'
      && payload.detail?.eventId === 'peg:357-re-ante:game-1:dealer-1:round-h2-r1:2:5'
    ));
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]?.[1]).toMatchObject({ alwaysPersist: true });
    expect(dispositions[0]?.[1].detail).toMatchObject({
      disposition: 'promote-immediate',
      financialKind: 'reante',
      transferCursor: 5,
    });
  });

  it('uses an animated batch only to retire the already-published notice', () => {
    act(() => { renderOwner(tax, null); });
    expect(container.textContent).toContain('Pussy Tax!');

    act(() => { ownerApi!.onBatchStarted(taxBatch); });
    expect(container.textContent).toContain('Pussy Tax!');

    act(() => { ownerApi!.onBatchSettled(taxBatch); });
    expect(container.textContent).not.toContain('Pussy Tax!');

    act(() => { renderOwner(tax, reAnte); });
    expect(container.textContent).toContain('Re-Ante');
    expect(container.textContent).not.toContain('Pussy Tax!');
  });
});
