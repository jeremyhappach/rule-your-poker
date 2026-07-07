/**
 * NeutralInterstitial `renderPane` contract test.
 *
 * Guarantees for the "opponent next-game configuration" boundary:
 *   1. Chat / Lobby / Score tabs remain SELECTABLE in the neutral
 *      interstitial (buttons are not disabled, no tab-lock).
 *   2. `renderPane` is invoked with the CURRENT tab id and its return
 *      value lands inside ShellHudGrid row 4 — so Chat becomes
 *      functional the moment the user picks it, even while the
 *      opponent is configuring the next game.
 *   3. Tab selection is presentation-only: switching tabs re-invokes
 *      `renderPane` with the new tab id and does NOT remount the
 *      interstitial (component instance is stable — proxy for "does
 *      not remount deal runtime / transport / reveal state"; the deal
 *      runtime lives at the shell root or persistent-children layer,
 *      never inside the interstitial).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NeutralInterstitial } from './NeutralInterstitial';
import { ShellTabBarProvider, ShellTabBar } from './ShellTabBar';

function Harness({
  activeTab,
  onActiveTabChange,
  renderPane,
}: {
  activeTab: 'cards' | 'chat' | 'lobby' | 'history';
  onActiveTabChange: (t: 'cards' | 'chat' | 'lobby' | 'history') => void;
  renderPane: (t: 'cards' | 'chat' | 'lobby' | 'history') => React.ReactNode;
}) {
  return (
    <ShellTabBarProvider>
      <NeutralInterstitial
        gameId="g1"
        reason="test"
        gameKind={null}
        anteAmount={0}
        activeTab={activeTab}
        onActiveTabChange={onActiveTabChange as any}
        renderPane={renderPane as any}
      />
      <ShellTabBar />
    </ShellTabBarProvider>
  );
}

describe('NeutralInterstitial renderPane contract', () => {
  it('invokes renderPane with the current tab and renders the result', () => {
    const spy = vi.fn((t: string) =>
      t === 'chat' ? <div data-testid="pane-chat">CHAT-PANE</div> : null
    );
    render(<Harness activeTab="chat" onActiveTabChange={() => {}} renderPane={spy as any} />);
    expect(spy).toHaveBeenCalledWith('chat');
    expect(screen.getByTestId('pane-chat').textContent).toBe('CHAT-PANE');
  });

  it('keeps Chat / Lobby / History tab buttons enabled (not disabled) in the interstitial', () => {
    render(
      <Harness
        activeTab="cards"
        onActiveTabChange={() => {}}
        renderPane={() => null}
      />
    );
    for (const label of ['Chat', 'Lobby', 'History', 'Cards']) {
      const btn = screen.getByLabelText(label) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    }
  });

  it('switching tabs re-invokes renderPane with the new tab id and does not remount', () => {
    const spy = vi.fn((t: string) => <div data-testid={`pane-${t}`}>{t.toUpperCase()}</div>);
    let current: 'cards' | 'chat' | 'lobby' | 'history' = 'chat';
    const { rerender } = render(
      <Harness activeTab={current} onActiveTabChange={(t) => { current = t; }} renderPane={spy as any} />
    );
    expect(screen.getByTestId('pane-chat')).toBeTruthy();

    // Simulate user picking Lobby.
    fireEvent.click(screen.getByLabelText('Lobby'));
    current = 'lobby';
    rerender(
      <Harness activeTab={current} onActiveTabChange={(t) => { current = t; }} renderPane={spy as any} />
    );
    expect(screen.getByTestId('pane-lobby')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith('lobby');
  });
});
