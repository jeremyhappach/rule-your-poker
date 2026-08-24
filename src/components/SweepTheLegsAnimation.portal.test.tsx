// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/threeFiveSeven/wartime', () => ({
  emitPresentationLifecycle: vi.fn(),
}));

import { SHELL_Z } from '@/lib/canonicalShell/zLayers';
import { SweepTheLegsAnimation } from './SweepTheLegsAnimation';

describe('SweepTheLegsAnimation stacking contract', () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it('portals the blocking celebration above the body-portaled HUD tab rail', () => {
    const gameplayTree = document.createElement('div');
    gameplayTree.style.transform = 'translateZ(0)';
    document.body.appendChild(gameplayTree);

    render(<SweepTheLegsAnimation show />, { container: gameplayTree });

    const overlay = document.body.querySelector<HTMLElement>('[data-sweep-the-legs-overlay]');
    const backdrop = overlay?.querySelector<HTMLElement>('[data-sweep-the-legs-backdrop]');

    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
    expect(Number(overlay?.style.zIndex)).toBe(SHELL_Z.CELEBRATION);
    expect(SHELL_Z.CELEBRATION).toBeGreaterThan(SHELL_Z.HUD_TAB_RAIL);
    expect(backdrop?.style.pointerEvents).toBe('auto');
  });
});
