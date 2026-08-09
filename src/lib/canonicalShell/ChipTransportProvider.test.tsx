// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return { ...actual, recordShellEvent: vi.fn() };
});

import {
  ChipTransportProvider,
  useChipTransport,
  useChipTransportInternal,
} from './ChipTransportProvider';
import type { ChipTransportIntent } from './GameplaySlotContract';

const baseIntent: ChipTransportIntent = {
  id: 'intent-1',
  amount: 10,
  from: { kind: 'seat', position: 2 },
  to: { kind: 'pot' },
  reason: 'bet',
};

type ApiRef = {
  api: ReturnType<typeof useChipTransport> | null;
  internal: ReturnType<typeof useChipTransportInternal> | null;
};

function Harness({ store }: { store: ApiRef }) {
  store.api = useChipTransport();
  store.internal = useChipTransportInternal();
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
  act(() => { root.unmount(); });
  container.remove();
});

describe('ChipTransportProvider', () => {
  it('accepts and dedupes by intent id', () => {
    const store: ApiRef = { api: null, internal: null };
    act(() => {
      root.render(
        <ChipTransportProvider>
          <Harness store={store} />
        </ChipTransportProvider>,
      );
    });
    act(() => { store.api!.dispatch(baseIntent); });
    expect(store.internal!.__activeIntents).toHaveLength(1);
    act(() => { store.api!.dispatch(baseIntent); });
    expect(store.internal!.__activeIntents).toHaveLength(1);
  });

  it('dispatchMany counts only newly accepted', () => {
    const store: ApiRef = { api: null, internal: null };
    act(() => {
      root.render(
        <ChipTransportProvider>
          <Harness store={store} />
        </ChipTransportProvider>,
      );
    });
    let accepted = 0;
    act(() => {
      accepted = store.api!.dispatchMany([
        baseIntent,
        { ...baseIntent, id: 'intent-2' },
        baseIntent,
      ]);
    });
    expect(accepted).toBe(2);
    expect(store.internal!.__activeIntents).toHaveLength(2);
  });

  it('markDropped logs a loud warning and removes the intent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store: ApiRef = { api: null, internal: null };
    act(() => {
      root.render(
        <ChipTransportProvider>
          <Harness store={store} />
        </ChipTransportProvider>,
      );
    });
    act(() => { store.api!.dispatch(baseIntent); });
    act(() => { store.internal!.__markDropped(baseIntent, 'missing-endpoint'); });
    expect(warn).toHaveBeenCalled();
    expect(store.internal!.__activeIntents).toHaveLength(0);
  });

  it('emits each financial flight boundary exactly once', () => {
    const store: ApiRef = { api: null, internal: null };
    const departed = vi.fn();
    const arrived = vi.fn();
    const settled = vi.fn();
    act(() => {
      root.render(
        <ChipTransportProvider>
          <Harness store={store} />
        </ChipTransportProvider>,
      );
    });
    act(() => {
      store.api!.dispatch(baseIntent, {
        onDeparted: departed,
        onArrived: arrived,
        onSettled: settled,
      });
      store.internal!.__markDeparted(baseIntent.id);
      store.internal!.__markDeparted(baseIntent.id);
      store.internal!.__markArrived(baseIntent.id);
      store.internal!.__markArrived(baseIntent.id);
      store.internal!.__markSettled(baseIntent.id, 1800);
    });
    expect(departed).toHaveBeenCalledTimes(1);
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('useChipTransport is a no-op outside provider', () => {
    const store: ApiRef = { api: null, internal: null };
    act(() => { root.render(<Harness store={store} />); });
    expect(store.api!.dispatch(baseIntent)).toBe(false);
    expect(store.api!.dispatchMany([baseIntent])).toBe(0);
  });
});
