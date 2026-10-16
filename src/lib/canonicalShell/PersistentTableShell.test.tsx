// @vitest-environment jsdom

/**
 * PersistentTableShell — Phase 4 scaffolding tests.
 */

import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shell structure tests must not contact the configured Supabase project.
vi.hoisted(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return { ...actual, recordShellEvent: vi.fn() };
});

import { PersistentTableShell } from './PersistentTableShell';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { recordShellEvent } from './diagnostics';
import { ShellTabBar, ShellTabBarStateContext, useShellTabBar } from './ShellTabBar';
import { ShellHudChrome } from './ShellHudChrome';
import { resolvePresentationMode } from './presentationMode';
import { useAnnouncementContext, useAnnouncements } from './announcements';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

describe('lobby announcement ownership', () => {
  let context: NonNullable<ReturnType<typeof useAnnouncementContext>>;
  function Probe() {
    context = useAnnouncementContext()!;
    return null;
  }
  function WaitingOwner({ gameId }: { gameId: string }) {
    const api = useAnnouncements();
    const ref = useRef(api);
    useEffect(() => { ref.current = api; }, [api]);
    useEffect(() => {
      ref.current.emit({ id: `${gameId}:waiting-table:ready`, type: 'waiting_for_players',
        scope: { dealerGameId: gameId }, payload: { text: 'Ready to Start!' } });
      return () => ref.current.clearAmbient('waiting_for_players');
    }, [gameId]);
    return null;
  }
  const tree = (lobbyMode = true, gameId = 'g1', waiting = true) =>
    <PersistentTableShell gameId={gameId} lobbyMode={lobbyMode}>
      <Probe />{waiting && <WaitingOwner gameId={gameId} />}
    </PersistentTableShell>;

  it('preserves an existing waiting announcement on lobby entry and subsequent context updates', () => {
    act(() => root.render(tree(false)));
    const ready = context.ambient;
    expect(ready?.payload?.text).toBe('Ready to Start!');
    act(() => root.render(tree()));
    expect(context.ambient).toBe(ready);
    act(() => context.emit({ id: 'late-win', type: 'match_win', scope: { dealerGameId: 'g1' } }));
    expect(context.transient).toBeNull();
    expect(context.ambient).toBe(ready);
  });

  it('preserves fresh waiting announcements but clears stale gameplay on entry and late arrival', () => {
    act(() => root.render(tree(false, 'g1', false)));
    act(() => context.emit({ id: 'ante', type: 'awaiting_ante', scope: { dealerGameId: 'g1' } }));
    expect(context.ambient?.id).toBe('ante');
    act(() => root.render(tree(true, 'g1', false)));
    expect(context.ambient).toBeNull();
    act(() => context.emit({ id: 'late-ante', type: 'awaiting_ante', scope: { dealerGameId: 'g1' } }));
    expect(context.ambient).toBeNull();
    act(() => root.render(tree()));
    expect(context.ambient?.payload?.text).toBe('Ready to Start!');
  });

  it.each([
    { id: 'g1:waiting-table:ready', scope: {} },
    { id: 'other:waiting-table:ready', scope: { dealerGameId: 'other' } },
    { id: 'gameplay-wait', scope: { dealerGameId: 'g1' } },
  ])('does not exempt unrelated waiting messages: $id', event => {
    act(() => root.render(tree(true, 'g1', false)));
    act(() => context.emit({ ...event, type: 'waiting_for_players' }));
    expect(context.ambient).toBeNull();
  });

  it.each([true, false])('clears the waiting owner on phase exit even when lobbyMode stays %s', lobbyMode => {
    act(() => root.render(tree()));
    expect(context.ambient?.payload?.text).toBe('Ready to Start!');
    act(() => root.render(tree(lobbyMode, 'g1', false)));
    expect(context.ambient).toBeNull();
    if (!lobbyMode) {
      act(() => context.emit({ id: 'selection', type: 'dealer_selection_in_progress', scope: { dealerGameId: 'g1' } }));
      expect(context.ambient?.id).toBe('selection');
    }
  });

  it('drops the departing session and reconstructs waiting on a fresh mount', () => {
    act(() => root.render(tree()));
    act(() => root.render(tree(true, 'g2', false)));
    expect(context.ambient).toBeNull();
    act(() => root.render(tree(true, 'g2')));
    expect(context.ambient?.id).toBe('g2:waiting-table:ready');
    act(() => root.render(null));
    act(() => root.render(tree(true, 'g2', false)));
    expect(context.ambient).toBeNull();
    act(() => root.render(tree(true, 'g2')));
    expect(context.ambient?.id).toBe('g2:waiting-table:ready');
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PersistentTableShell', () => {
  it.each(['3-5-7','cribbage','farkle','gin-rummy','holm-game','horses','ship-captain-crew','yahtzee'])('keeps the original shell DOM and geometry for %s', gameType => {
    const content = <span data-testid="unchanged-game">game</span>;
    act(() => root.render(<PersistentTableShell gameType={gameType} header={<span>Header</span>}>{content}</PersistentTableShell>));
    const before = container.innerHTML;
    const mode = resolvePresentationMode([{game_type:gameType === 'holm-game' ? 'holm' : gameType,presentation_mode:'table'}],gameType,'dg','in_progress');
    act(() => root.render(<PersistentTableShell presentationMode={mode} gameType={gameType} header={<span>Header</span>}>{content}</PersistentTableShell>));
    expect(container.innerHTML).toBe(before);
    expect(container.querySelector('[data-canonical-felt-interaction-layer]')).not.toBeNull();
  });
  it('switches presentation without remounting the shell or game owner', () => {
    vi.useFakeTimers();
    const mount=vi.fn(),unmount=vi.fn();
    function GameOwner(){useEffect(()=>{mount();return unmount;},[]);return <div data-owner/>;}
    act(()=>root.render(<PersistentTableShell gameType="run21"><GameOwner/></PersistentTableShell>));
    const shell=container.querySelector('[data-canonical-shell-root]'),owner=container.querySelector('[data-owner]');
    act(()=>root.render(<PersistentTableShell gameType="run21" presentationMode="fullscreen"><GameOwner/></PersistentTableShell>));
    expect(shell?.getAttribute('data-shell-transition')).toBe('outgoing');
    act(()=>vi.advanceTimersByTime(170));
    expect(container.querySelector('[data-canonical-shell-root]')).toBe(shell);
    expect(container.querySelector('[data-owner]')).toBe(owner);
    expect(container.querySelector('[data-canonical-felt-interaction-layer]')).toBeNull();
    expect(container.querySelector('[data-canonical-felt-surface]')).toBeNull();
    expect(mount).toHaveBeenCalledTimes(1);expect(unmount).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('mounts and removes registered tabs without changing hook order', () => {
    const errors = vi.spyOn(console, 'error');
    const state = { cardsIcon: 'spade' as const, activeTab: 'cards' as const, setActiveTab: () => {} };
    try {
      for (const registered of [null, state, null, state]) {
        act(() => {
          root.render(
            <ShellTabBarStateContext.Provider value={registered}>
              <ShellTabBar />
            </ShellTabBarStateContext.Provider>,
          );
        });
        expect(!!document.body.querySelector('[data-canonical-shell-tabbar]')).toBe(!!registered);
      }
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(/order of Hooks|Expected static flag|Rendered (?:more|fewer) hooks/);
    } finally {
      errors.mockRestore();
    }
  });

  it('renders a transparent canonical-shell root wrapper', () => {
    act(() => {
      root.render(
        <PersistentTableShell gameId="g1" gameType="cribbage">
          <span data-testid="child">hello</span>
        </PersistentTableShell>,
      );
    });
    const child = container.querySelector('[data-testid="child"]') as HTMLElement;
    expect(child).toBeTruthy();
    const wrapper = child.closest('[data-canonical-shell-root]') as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper!.getAttribute('data-canonical-shell-root')).toBe('');
    expect(wrapper!.getAttribute('data-shell-game-type')).toBe('cribbage');

  });

  it('uses deterministic shell rows and lets the game mount a unified HUD stack', () => {
    function TabProbe() {
      useShellTabBar({
        cardsIcon: 'spade',
        activeTab: 'cards',
        setActiveTab: () => {},
      });
      return (
        <>
          <div data-testid="gameplay">gameplay</div>
          <div data-testid="hud-stack">
            <ShellHudChrome />
            <span data-testid="game-content">game</span>
          </div>
        </>
      );
    }
    act(() => {
      root.render(
        <PersistentTableShell gameId="g1" gameType="cribbage" header={<div data-testid="header">header</div>}>
          <TabProbe />
        </PersistentTableShell>,
      );
    });
    const column = container.querySelector('[data-canonical-shell-column]') as HTMLElement | null;
    const rail = container.querySelector('[data-canonical-shell-announcement-rail]') as HTMLElement | null;
    // ShellTabBar now renders an in-place placeholder (still under the
    // shell container) and portals the interactive bar to document.body
    // so it survives Radix modal body { pointer-events: none } and z-index
    // covers. Assert both halves are present.
    const placeholder = container.querySelector('[data-canonical-shell-tabbar-placeholder]') as HTMLElement | null;
    const tabbar = document.body.querySelector('[data-canonical-shell-tabbar]') as HTMLElement | null;
    const portalRoot = document.body.querySelector('[data-canonical-shell-tabbar-portal-root]') as HTMLElement | null;
    const children = container.querySelector('[data-canonical-shell-children]') as HTMLElement | null;
    expect(column?.style.gridTemplateRows).toBe('var(--shell-header-h) minmax(0, 1fr)');
    expect(container.querySelector('[data-canonical-shell-spacer]')).toBeNull();
    expect(children).toBeTruthy();
    expect(rail).toBeTruthy();
    expect(placeholder).toBeTruthy();
    expect(tabbar).toBeTruthy();
    expect(portalRoot).toBeTruthy();
    // Rail's in-place sibling is now the placeholder that reserves the
    // shell tab-row height; the actual tabbar lives in document.body.
    expect(rail!.nextElementSibling).toBe(placeholder);
    expect(placeholder!.style.height).toBe('var(--hud-h-tabs)');
    // Portal container escapes body-level pointer-events lock and
    // sits in the canonical HUD_TAB_RAIL band — above passive
    // overlays, below chip/card transport (80/82), and far below
    // Radix DialogOverlay/Content (9998/9999).
    expect(portalRoot!.style.pointerEvents).toBe('auto');
    expect(Number(portalRoot!.style.zIndex)).toBeGreaterThan(0);
    expect(Number(portalRoot!.style.zIndex)).toBeLessThan(80);
    expect(portalRoot!.style.position).toBe('fixed');
  });

  it('does not mount SeatAnchorLayer when seats are not provided', () => {
    let saw: unknown = 'init';
    function Probe() {
      saw = useSeatAnchorsOptional();
      return null;
    }
    act(() => {
      root.render(
        <PersistentTableShell gameId="g1" gameType="cribbage">
          <Probe />
        </PersistentTableShell>,
      );
    });
    expect(saw).toBeNull();
  });

  it('mounts SeatAnchorLayer when projectionMode + seats provided', () => {
    let count = -1;
    function Probe() {
      const ctx = useSeatAnchorsOptional();
      count = ctx ? ctx.anchors.length : -1;
      return null;
    }
    act(() => {
      root.render(
        <PersistentTableShell
          gameId="g1"
          gameType="horses"
          projectionMode="observer-absolute"
          viewerPosition={null}
          seats={[
            { position: 1, occupied: true },
            { position: 2, occupied: true },
          ]}
        >
          <Probe />
        </PersistentTableShell>,
      );
    });
    expect(count).toBe(2);
  });

  it('emits shell-mounted once on mount and shell-unmounted once on unmount', () => {
    const localContainer = document.createElement('div');
    document.body.appendChild(localContainer);
    const localRoot = createRoot(localContainer);
    act(() => {
      localRoot.render(
        <PersistentTableShell gameId="g1" gameType="cribbage">
          <span />
        </PersistentTableShell>,
      );
    });
    const mock = recordShellEvent as unknown as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls.filter(c => c[0] === 'shell-mounted')).toHaveLength(1);
    expect(mock.mock.calls.filter(c => c[0] === 'shell-unmounted')).toHaveLength(0);
    act(() => localRoot.unmount());
    expect(mock.mock.calls.filter(c => c[0] === 'shell-mounted')).toHaveLength(1);
    expect(mock.mock.calls.filter(c => c[0] === 'shell-unmounted')).toHaveLength(1);
    localContainer.remove();
  });
});
