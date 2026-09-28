// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELL_Z } from '@/lib/canonicalShell/zLayers';
import type { FarkleBlockingOverlayReceipt } from '@/lib/farkle/presentation';
import { FarkleBlockingOverlay } from './FarkleBlockingOverlay';

const banked: FarkleBlockingOverlayReceipt = {
  id: 'scope/4/banked', scopeKey: 'scope', sequence: 4, eventType: 'banked',
  displayLifetimeMs: 1900, points: 1250, lost: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Farkle blocking overlays', () => {
  it('portals BANKED at the canonical highest blocking layer and retires only at its receipt lifetime', async () => {
    const onRetire = vi.fn();
    render(<FarkleBlockingOverlay receipt={banked} onRetire={onRetire} />);
    const overlay = document.querySelector('[data-farkle-blocking-overlay="banked"]') as HTMLElement;
    expect(overlay).toBeInTheDocument();
    expect(overlay.style.zIndex).toBe(String(SHELL_Z.MODAL_OVERLAY));
    expect(screen.getByText('BANKED')).toBeVisible();
    expect(screen.getByText('+1,250')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1899); });
    expect(onRetire).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onRetire).toHaveBeenCalledWith(banked.id);
  });

  it('renders the original Farkle bust and omits a zero-loss line', () => {
    render(<FarkleBlockingOverlay receipt={{ ...banked, id: 'scope/5/farkle', sequence: 5, eventType: 'farkle', points: 0, lost: 0 }} preview />);
    expect(screen.getByText('FARKLE!')).toBeVisible();
    expect(screen.queryByText(/LOST/)).toBeNull();
    expect(document.querySelector('.farkle-bust-die')).toBeInTheDocument();
  });

  it('renders HOT DICE independently in Geometry Lab preview without scheduling retirement', async () => {
    const onRetire = vi.fn();
    render(<FarkleBlockingOverlay receipt={{ ...banked, id: 'scope/6/hot_dice', sequence: 6, eventType: 'hot_dice' }} onRetire={onRetire} preview />);
    expect(screen.getByText('HOT DICE!')).toBeVisible();
    expect(screen.getByText('ROLL ALL 6 AGAIN')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(onRetire).not.toHaveBeenCalled();
  });
});
