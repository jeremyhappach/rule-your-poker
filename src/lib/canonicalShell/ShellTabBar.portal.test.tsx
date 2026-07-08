// @ts-nocheck
// @vitest-environment jsdom

/**
 * ShellTabBar portal / layering repair.
 *
 * Two invariants:
 *
 *   1. INTERACTIVITY — the tab bar must remain physically clickable
 *      even when Radix Dialog imposes `body { pointer-events: none }`.
 *      Solved by portaling into `document.body` with
 *      `pointer-events: auto` on the portal root.
 *
 *   2. LAYERING — the tab bar must sit in the canonical
 *      `SHELL_Z.HUD_TAB_RAIL` band: above passive overlays, below
 *      chip/card transport, and FAR below Radix DialogOverlay/Content.
 *      The previous fix used `zIndex: 10000` which overcorrected the
 *      interactivity problem by promoting the rail above true blocking
 *      modals and above transport. That specific magic number is now
 *      forbidden.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShellTabBar, ShellTabBarStateContext, type ShellTabBarState } from './ShellTabBar';
import { SHELL_Z } from './zLayers';

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
  document.body.style.pointerEvents = '';
});

function renderTabBar(overrides: Partial<ShellTabBarState> = {}) {
  const state: ShellTabBarState = {
    cardsIcon: 'spade',
    activeTab: 'cards',
    setActiveTab: () => {},
    ...overrides,
  };
  act(() => {
    root.render(
      <ShellTabBarStateContext.Provider value={state}>
        <ShellTabBar />
      </ShellTabBarStateContext.Provider>,
    );
  });
}

describe('ShellTabBar portal / layering repair', () => {
  it('renders an in-place placeholder that preserves the shell tab-row height', () => {
    renderTabBar();
    const placeholder = container.querySelector('[data-canonical-shell-tabbar-placeholder]') as HTMLElement | null;
    expect(placeholder).toBeTruthy();
    expect(placeholder!.style.height).toBe('var(--hud-h-tabs)');
    expect(placeholder!.style.minHeight).toBe('var(--hud-h-tabs)');
  });

  it('portals the interactive tab bar into document.body with pointer-events:auto', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement | null;
    expect(portalRoot).toBeTruthy();
    expect(portalRoot!.parentElement).toBe(document.body);
    expect(portalRoot!.style.position).toBe('fixed');
    expect(portalRoot!.style.pointerEvents).toBe('auto');
  });

  it('keeps buttons interactive when body { pointer-events: none } is imposed (Radix modal simulation)', () => {
    renderTabBar();
    document.body.style.pointerEvents = 'none';
    const chatBtn = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root] [aria-label="Chat"]',
    ) as HTMLElement | null;
    expect(chatBtn).toBeTruthy();
    const portalRoot = chatBtn!.closest('[data-canonical-shell-tabbar-portal-root]') as HTMLElement;
    expect(portalRoot.style.pointerEvents).toBe('auto');
    const tabbarWrapper = document.body.querySelector('[data-canonical-shell-tabbar]') as HTMLElement;
    expect(tabbarWrapper.style.pointerEvents).toBe('auto');
  });
});

describe('ShellTabBar canonical z-layer contract', () => {
  it('uses SHELL_Z.HUD_TAB_RAIL for the portal container z-index', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement;
    expect(Number(portalRoot.style.zIndex)).toBe(SHELL_Z.HUD_TAB_RAIL);
  });

  it('sits ABOVE passive shell overlays', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement;
    expect(Number(portalRoot.style.zIndex)).toBeGreaterThan(SHELL_Z.PASSIVE_OVERLAY);
  });

  it('sits BELOW deal/chip transport so cards and chips fly over the rail', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement;
    expect(Number(portalRoot.style.zIndex)).toBeLessThan(SHELL_Z.CHIP_TRANSPORT);
    expect(Number(portalRoot.style.zIndex)).toBeLessThan(SHELL_Z.CARD_TRANSPORT);
  });

  it('sits BELOW Radix DialogOverlay/Content so true blocking modals cover the rail', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement;
    expect(Number(portalRoot.style.zIndex)).toBeLessThan(SHELL_Z.MODAL_OVERLAY);
    expect(Number(portalRoot.style.zIndex)).toBeLessThan(SHELL_Z.MODAL_CONTENT);
  });

  it('contains no hardcoded z-index 10000 in ShellTabBar source (magic-number regression guard)', () => {
    const src = readFileSync(
      path.resolve(__dirname, 'ShellTabBar.tsx'),
      'utf8',
    );
    // Strip comments so the historical explanation of the 10000 fix
    // does not trip the guard.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/\b10000\b/);
    expect(stripped).not.toMatch(/zIndex\s*:\s*10000/);
  });

  it('exposes an ordered z-layer contract (felt < passive < tab rail < transport < modal)', () => {
    expect(SHELL_Z.FELT_BASE).toBeLessThan(SHELL_Z.PASSIVE_OVERLAY);
    expect(SHELL_Z.PASSIVE_OVERLAY).toBeLessThan(SHELL_Z.HUD_TAB_RAIL);
    expect(SHELL_Z.HUD_TAB_RAIL).toBeLessThan(SHELL_Z.CHIP_TRANSPORT);
    expect(SHELL_Z.CHIP_TRANSPORT).toBeLessThanOrEqual(SHELL_Z.CARD_TRANSPORT);
    expect(SHELL_Z.CARD_TRANSPORT).toBeLessThan(SHELL_Z.CELEBRATION);
    expect(SHELL_Z.CELEBRATION).toBeLessThan(SHELL_Z.MODAL_OVERLAY);
    expect(SHELL_Z.MODAL_OVERLAY).toBeLessThan(SHELL_Z.MODAL_CONTENT);
  });
});

