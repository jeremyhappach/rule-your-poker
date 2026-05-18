import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  ChipTransportProvider,
  useChipTransport,
  useChipTransportInternal,
} from './ChipTransportProvider';
import type { ChipTransportIntent } from './GameplaySlotContract';

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useChipTransport>, internal: ReturnType<typeof useChipTransportInternal>) => void }) {
  const api = useChipTransport();
  const internal = useChipTransportInternal();
  onReady(api, internal);
  return null;
}

const baseIntent: ChipTransportIntent = {
  id: 'intent-1',
  amount: 10,
  from: { kind: 'seat', position: 2 },
  to: { kind: 'pot' },
  reason: 'bet',
};

describe('ChipTransportProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a new intent and dedupes repeat dispatches of the same id', () => {
    let api: ReturnType<typeof useChipTransport> | null = null;
    let internal: ReturnType<typeof useChipTransportInternal> | null = null;
    render(
      <ChipTransportProvider>
        <Harness onReady={(a, i) => { api = a; internal = i; }} />
      </ChipTransportProvider>,
    );
    expect(api).not.toBeNull();
    act(() => {
      expect(api!.dispatch(baseIntent)).toBe(true);
    });
    expect(internal!.__activeIntents).toHaveLength(1);
    act(() => {
      expect(api!.dispatch(baseIntent)).toBe(false);
    });
    expect(internal!.__activeIntents).toHaveLength(1);
  });

  it('dispatchMany returns count of newly accepted intents', () => {
    let api: ReturnType<typeof useChipTransport> | null = null;
    render(
      <ChipTransportProvider>
        <Harness onReady={(a) => { api = a; }} />
      </ChipTransportProvider>,
    );
    let accepted = 0;
    act(() => {
      accepted = api!.dispatchMany([
        baseIntent,
        { ...baseIntent, id: 'intent-2' },
        baseIntent, // dup
      ]);
    });
    expect(accepted).toBe(2);
  });

  it('markDropped emits a console warn (loud diagnostic)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let internal: ReturnType<typeof useChipTransportInternal> | null = null;
    let api: ReturnType<typeof useChipTransport> | null = null;
    render(
      <ChipTransportProvider>
        <Harness onReady={(a, i) => { api = a; internal = i; }} />
      </ChipTransportProvider>,
    );
    act(() => { api!.dispatch(baseIntent); });
    act(() => { internal!.__markDropped(baseIntent, 'missing-endpoint'); });
    expect(warn).toHaveBeenCalled();
    expect(internal!.__activeIntents).toHaveLength(0);
  });

  it('useChipTransport is a no-op outside the provider', () => {
    let api: ReturnType<typeof useChipTransport> | null = null;
    render(<Harness onReady={(a) => { api = a; }} />);
    expect(api!.dispatch(baseIntent)).toBe(false);
    expect(api!.dispatchMany([baseIntent])).toBe(0);
  });
});
