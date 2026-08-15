// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardTransportProvider, useCardTransport, useCardTransportInternal } from './CardTransportProvider';
import { DealRuntime, useDealRuntime } from './DealRuntime';
import { isHolmHandReady } from './holmDealBarrier';
import type { CardTransportIntent } from './types';
import { getCanonicalTimerEligibility } from '../timerEligibility';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const handContextId = 'round-2:h2';
const intent = (suffix: string, context = handContextId): CardTransportIntent => ({
  id: `${context}#${suffix}`,
  cardId: `${context}#${suffix}`,
  handContextId: context,
  handGeneration: 1,
  face: 'hidden',
  from: { kind: 'seat', position: 2 },
  to: { kind: 'community', index: 0 },
});

type Store = {
  transport: ReturnType<typeof useCardTransport> | null;
  internal: ReturnType<typeof useCardTransportInternal> | null;
  deal: ReturnType<typeof useDealRuntime> | null;
};

function TransportHarness({ store }: { store: Store }) {
  store.transport = useCardTransport();
  store.internal = useCardTransportInternal();
  return null;
}

function DealHarness({ store, expected }: { store: Store; expected: CardTransportIntent[] }) {
  const deal = useDealRuntime();
  const transport = useCardTransport();
  store.deal = deal;

  useEffect(() => {
    if (!deal || deal.phase !== 'PRE_DEAL') return;
    deal.beginDealForHand({
      handContextId,
      handGeneration: 1,
      expectedCards: expected.map((entry) => ({ cardId: entry.cardId, handContextId })),
    });
    transport.reconcileMany(expected);
  }, [deal, expected, transport]);
  return null;
}

function DealStateHarness({ store }: { store: Store }) {
  store.deal = useDealRuntime();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Holm card manifest reconciliation', () => {
  it('opens the ready barrier immediately for an already-actionable historical hand', async () => {
    const historicalHandContextId = 'round-historical:h4';
    const store: Store = { transport: null, internal: null, deal: null };
    await act(async () => {
      root.render(
        <CardTransportProvider gameId="game" gameType="holm-game">
          <DealRuntime
            handContextId={historicalHandContextId}
            gameType="holm-game"
            initialPhase="GAMEPLAY"
          >
            <DealStateHarness store={store} />
          </DealRuntime>
        </CardTransportProvider>,
      );
    });
    expect(isHolmHandReady(historicalHandContextId)).toBe(true);
    expect(store.deal).toMatchObject({
      phase: 'GAMEPLAY',
      dealSettled: true,
      readyReleased: true,
    });
    expect(getCanonicalTimerEligibility({
      gameType: 'holm-game',
      dealPhase: store.deal!.phase,
      dealSettled: store.deal!.dealSettled,
      readyReleased: store.deal!.readyReleased,
      activePlayerId: 'player-1',
    })).toEqual({ visible: true, running: true });
  });

  it('reconciles unseen, active, and settled deterministic intents without redispatch', () => {
    const store: Store = { transport: null, internal: null, deal: null };
    const cards = [intent('hand-0'), intent('hand-1')];
    act(() => {
      root.render(
        <CardTransportProvider gameId="game" gameType="holm-game">
          <TransportHarness store={store} />
        </CardTransportProvider>,
      );
    });

    let first!: ReturnType<NonNullable<Store['transport']>['reconcileMany']>;
    act(() => { first = store.transport!.reconcileMany(cards); });
    expect(first).toMatchObject({ accepted: 2, active: 2, settled: 0, allOwned: true });

    act(() => { store.internal!.__markSettled(cards[0].id, cards[0].cardId, 'test'); });
    const replay = store.transport!.reconcileMany(cards);
    expect(replay).toMatchObject({ accepted: 0, active: 1, settled: 1, allOwned: true });
    expect(store.transport!.getIntentLifecycle(cards[0].id)).toMatchObject({ state: 'settled' });
  });

  it('replays only the exact hand into a remounted DealRuntime', async () => {
    const store: Store = { transport: null, internal: null, deal: null };
    const current = [intent('hand-0')];
    const stale = intent('hand-0', 'round-1:h1');
    let showRuntime = true;

    const render = () => root.render(
      <CardTransportProvider gameId="game" gameType="holm-game">
        <TransportHarness store={store} />
        {showRuntime ? (
          <DealRuntime key={handContextId} handContextId={handContextId} gameType="holm-game">
            <DealHarness store={store} expected={current} />
          </DealRuntime>
        ) : null}
      </CardTransportProvider>,
    );

    await act(async () => { render(); });
    act(() => {
      store.transport!.reconcileMany([stale]);
      store.internal!.__markSettled(stale.id, stale.cardId, 'stale-test');
    });
    expect(store.deal!.settledCardIds.has(stale.cardId)).toBe(false);

    await act(async () => {
      store.internal!.__markSettled(current[0].id, current[0].cardId, 'current-test');
    });
    expect(store.deal!.settledCardIds.has(current[0].cardId)).toBe(true);

    showRuntime = false;
    await act(async () => { render(); });
    showRuntime = true;
    await act(async () => { render(); });

    expect(store.deal!.settledCardIds.has(current[0].cardId)).toBe(true);
    expect(store.deal!.settledCardIds.has(stale.cardId)).toBe(false);
    expect(store.transport!.reconcileMany(current)).toMatchObject({
      accepted: 0,
      settled: 1,
      allOwned: true,
    });
  });

  it('rejects a settle from the wrong generation of the same hand', async () => {
    const store: Store = { transport: null, internal: null, deal: null };
    const wrongGeneration = [{ ...intent('hand-0'), handGeneration: 2 }];
    await act(async () => {
      root.render(
        <CardTransportProvider gameId="game" gameType="holm-game">
          <TransportHarness store={store} />
          <DealRuntime handContextId={handContextId} gameType="holm-game">
            <DealHarness store={store} expected={wrongGeneration} />
          </DealRuntime>
        </CardTransportProvider>,
      );
    });
    await act(async () => {
      store.internal!.__markSettled(
        wrongGeneration[0].id,
        wrongGeneration[0].cardId,
        'wrong-generation-test',
      );
    });
    expect(store.deal!.settledCardIds.has(wrongGeneration[0].cardId)).toBe(false);
    expect(store.deal!.dealSettled).toBe(false);
  });

  it('does not treat a cancelled intent as presentation-complete', () => {
    const store: Store = { transport: null, internal: null, deal: null };
    const card = intent('hand-0');
    act(() => {
      root.render(
        <CardTransportProvider gameId="game" gameType="holm-game">
          <TransportHarness store={store} />
        </CardTransportProvider>,
      );
    });
    act(() => {
      store.transport!.reconcileMany([card]);
      store.internal!.__markDropped(card, 'identity-cancelled');
    });
    expect(store.transport!.reconcileMany([card])).toMatchObject({
      dropped: 1,
      allOwned: false,
    });
  });
});
