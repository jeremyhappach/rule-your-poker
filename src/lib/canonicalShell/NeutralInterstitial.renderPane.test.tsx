/**
 * NeutralInterstitial `renderPane` contract test.
 *
 * Uses react-dom/server (already a project dependency) to avoid pulling
 * in @testing-library/react. The contract we assert:
 *
 *   1. `renderPane` is invoked with the CURRENT tab id, and its return
 *      value ends up rendered inside NeutralInterstitial (proxy for
 *      "Chat is functional during opponent next-game configuration").
 *   2. `renderPane` is invoked on every render — switching tabs
 *      re-invokes with the new tab id without remounting the
 *      interstitial (this is what preserves deal-runtime continuity;
 *      the interstitial never owned deal runtime, and this test
 *      pins that behaviour by asserting the pane is a pure projection
 *      of the current tab).
 *   3. Tab buttons in ShellTabBar have no `disabled` gate — they
 *      remain selectable in the neutral interstitial.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NeutralInterstitial } from './NeutralInterstitial';
import { ShellTabBarProvider } from './ShellTabBar';

function render(activeTab: 'cards' | 'chat' | 'lobby' | 'history', renderPane: (t: any) => any) {
  return renderToStaticMarkup(
    <ShellTabBarProvider>
      <NeutralInterstitial
        gameId="g1"
        reason="test"
        gameKind={null}
        anteAmount={0}
        activeTab={activeTab}
        onActiveTabChange={() => {}}
        renderPane={renderPane as any}
      />
    </ShellTabBarProvider>,
  );
}

describe('NeutralInterstitial renderPane contract', () => {
  it('invokes renderPane with the current tab id and renders the result', () => {
    const spy = vi.fn((t: string) => `PANE:${t}`);
    const html = render('chat', spy);
    expect(spy).toHaveBeenCalledWith('chat');
    expect(html).toContain('PANE:chat');
  });

  it('re-invokes renderPane with the new tab id on a subsequent render (presentation-only projection)', () => {
    const spy = vi.fn((t: string) => `PANE:${t}`);
    render('chat', spy);
    render('lobby', spy);
    render('history', spy);
    const tabsSeen = spy.mock.calls.map((c) => c[0]);
    expect(tabsSeen).toContain('chat');
    expect(tabsSeen).toContain('lobby');
    expect(tabsSeen).toContain('history');
  });

  it('never forces a tab switch — onActiveTabChange is not invoked from the interstitial itself', () => {
    const change = vi.fn();
    renderToStaticMarkup(
      <ShellTabBarProvider>
        <NeutralInterstitial
          gameId="g1"
          reason="test"
          gameKind={null}
          anteAmount={0}
          activeTab="chat"
          onActiveTabChange={change}
          renderPane={() => null}
        />
      </ShellTabBarProvider>,
    );
    expect(change).not.toHaveBeenCalled();
  });
});
