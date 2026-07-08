// @vitest-environment jsdom

/**
 * ShellTabBar portal / layering repair.
 *
 * Regression contract for the Fix #1 change: ShellTabBar must remain
 * physically clickable even when a Radix Dialog imposes
 * `body { pointer-events: none }` and mounts an overlay at z-9998.
 *
 * Prior geometry (grid-row-native tabbar) failed the exported trace:
 *   pointerEventsNoneAncestor: "DIV.flex.items-center"
 *   computedPointerEvents:   "none"
 *   coveredAtCenter:         true (covererTag: DIV.fixed.inset-0)
 *
 * Post-fix geometry (portal container in document.body):
 *   - pointer-events: auto on the portal root escapes the body lock
 *   - z-index: 10000 covers Radix Dialog z-9998/9999
 *   - in-place placeholder preserves ShellHudGrid row height
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShellTabBar, ShellTabBarStateContext, type ShellTabBarState } from './ShellTabBar';

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
  // Clean any lingering body-level lock a prior test may have set.
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

  it('portals the interactive tab bar into document.body with pointer-events:auto and z-index:10000', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement | null;
    expect(portalRoot).toBeTruthy();
    // Portal is a direct child of document.body, escaping any
    // container-level or shell-column-level stacking context.
    expect(portalRoot!.parentElement).toBe(document.body);
    expect(portalRoot!.style.position).toBe('fixed');
    expect(portalRoot!.style.zIndex).toBe('10000');
    expect(portalRoot!.style.pointerEvents).toBe('auto');
  });

  it('keeps buttons interactive when body { pointer-events: none } is imposed (Radix modal simulation)', () => {
    renderTabBar();
    // Simulate what Radix Dialog does on open.
    document.body.style.pointerEvents = 'none';
    const chatBtn = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root] [aria-label="Chat"]',
    ) as HTMLElement | null;
    expect(chatBtn).toBeTruthy();
    // The portal container explicitly opts back into pointer events,
    // so the button's own computed pointer-events remains 'auto'.
    const portalRoot = chatBtn!.closest('[data-canonical-shell-tabbar-portal-root]') as HTMLElement;
    expect(portalRoot.style.pointerEvents).toBe('auto');
    const tabbarWrapper = document.body.querySelector('[data-canonical-shell-tabbar]') as HTMLElement;
    expect(tabbarWrapper.style.pointerEvents).toBe('auto');
  });

  it('sits above Radix DialogOverlay (z-9998) and DialogContent (z-9999)', () => {
    renderTabBar();
    const portalRoot = document.body.querySelector(
      '[data-canonical-shell-tabbar-portal-root]',
    ) as HTMLElement;
    // Numeric comparison so we cannot regress by dropping below the
    // Radix modal band (9998/9999) without failing the test.
    expect(Number(portalRoot.style.zIndex)).toBeGreaterThan(9999);
  });
});
