// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeometryLabDraftProvider, useDomainDraft, useGeometryLabDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { _setFromRemote } from '@/lib/geometryLab/defaultsRegistry';
import {
  FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS,
  FARKLE_BLOCKING_OVERLAY_TIMING_KEY,
  type FarkleBlockingOverlayTiming,
} from '@/lib/farkle/blockingOverlayTiming';
import { FarkleGeometryPreview } from './FarkleGeometryPreview';

const { from, upsert } = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));

function PersistenceProbe() {
  const { value, setValue } = useDomainDraft<FarkleBlockingOverlayTiming>(
    FARKLE_BLOCKING_OVERLAY_TIMING_KEY,
    FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS,
  );
  const { applyAll } = useGeometryLabDraft();
  return <>
    <output data-testid="timing-value">{value.displayLifetimeMs}</output>
    <button onClick={() => setValue({ displayLifetimeMs: 2450 })}>Set timing</button>
    <button onClick={() => void applyAll()}>Apply timing</button>
  </>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  _setFromRemote(FARKLE_BLOCKING_OVERLAY_TIMING_KEY, FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS, { isInitialFetch: true, rowExists: false });
});

describe('Farkle Geometry Lab overlay setting', () => {
  it('previews BANKED, FARKLE, and HOT DICE independently from the Farkle-only draft timing', () => {
    render(<GeometryLabDraftProvider><FarkleGeometryPreview /></GeometryLabDraftProvider>);
    const lifetime = screen.getByLabelText('Farkle blocking overlay display lifetime') as HTMLInputElement;
    expect(lifetime.value).toBe('1900');
    expect(screen.getByText('+1,250')).toBeVisible();
    fireEvent.change(lifetime, { target: { value: '2450' } });
    expect(lifetime.value).toBe('2450');
    expect(screen.getByText(/draft awaiting Apply Changes/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Preview event'), { target: { value: 'farkle' } });
    expect(screen.getByText('FARKLE!')).toBeVisible();
    expect(screen.getByText('LOST 650')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Preview event'), { target: { value: 'hot_dice' } });
    expect(screen.getByText('HOT DICE!')).toBeVisible();
  });

  it('persists the Farkle-only timing through the shared Geometry Lab Apply path', async () => {
    upsert.mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    render(<GeometryLabDraftProvider><PersistenceProbe /></GeometryLabDraftProvider>);
    fireEvent.click(screen.getByText('Set timing'));
    await act(async () => { fireEvent.click(screen.getByText('Apply timing')); });
    expect(from).toHaveBeenCalledWith('system_settings');
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ key: FARKLE_BLOCKING_OVERLAY_TIMING_KEY, value: { displayLifetimeMs: 2450 } }),
    ]), { onConflict: 'key' });
  });
});
