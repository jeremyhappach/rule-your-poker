// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalAnnouncementProvider, useAnnouncementContext } from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import { renderAnnouncement } from '@/lib/canonicalShell/announcements/renderers';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';
import type { FarkleDie, FarkleState } from '@/lib/farkle/types';
import { FarkleGameTable, type FarkleParticipant } from './FarkleGameTable';

vi.mock('@/lib/canonicalShell/ShellOwnedFeltHost', () => ({ usePublishShellFelt: vi.fn() }));
vi.mock('@/lib/canonicalShell/ShellTimerRail', () => ({ useShellTimer: vi.fn(), ShellTimerRail: () => null }));
vi.mock('@/lib/canonicalShell/ShellTabBar', () => ({ useShellTabBar: vi.fn() }));
vi.mock('@/lib/canonicalShell/ShellHudGrid', () => ({ ShellHudGrid: ({ pane }: { pane: React.ReactNode }) => <div data-test-pane>{pane}</div> }));
vi.mock('@/lib/canonicalShell/GameplayOpponentSeatLayer', () => ({ GameplayOpponentSeatLayer: () => null }));
vi.mock('@/lib/farkle/FarkleGameplayGeometryProvider', () => ({ FarkleGameplayGeometryProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./FarkleAnchoredSlot', () => ({ FarkleAnchoredSlot: ({ artifactId, children }: { artifactId: string; children: React.ReactNode }) => <div data-test-slot={artifactId}>{children}</div> }));
vi.mock('@/hooks/GameChatContext', () => ({ useGameChatContext: () => ({}) }));
vi.mock('@/lib/sessionPlayerIntent', () => ({ setAutomaticPlay: vi.fn() }));
vi.mock('@/lib/farkle/authority', () => ({
  readFarkleReplay: vi.fn().mockResolvedValue(null), applyFarkleAction: vi.fn(), createFarkleActionRequest: vi.fn(),
}));
vi.mock('./FarkleTerminalPresentation', () => ({ FarkleTerminalPresentation: () => null }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: () => null, DialogContent: () => null, DialogHeader: () => null, DialogTitle: () => null }));

function NoticeProbe() {
  const event = useAnnouncementContext()?.active;
  return <div data-test-notice>{event ? renderAnnouncement(event) : null}</div>;
}

const scope = { gameId: 'session', dealerGameId: 'dealer', handNumber: 1, roundId: farkleTestState()._authorityScope };
const [first, second] = farkleTestState().turnOrder;
const players: FarkleParticipant[] = [first, second].map((id, position) => ({ id, user_id: `user-${position}`, position, chips: 100, is_bot: false }));

function terminalRoll(before: FarkleState, dice: FarkleDie[]): FarkleState {
  const actorId = before.currentTurnPlayerId;
  return { ...before, actionSequence: before.actionSequence + 1,
    currentTurnPlayerId: actorId === first ? second : first, stage: 'roll', dice: [],
    available: [0, 1, 2, 3, 4, 5], rollNumber: 0, thisTurn: 0,
    events: [
      { type: 'dice_rolled', playerId: actorId, dice, rollNumber: before.rollNumber + 1, scoringCycle: before.scoringCycle },
      { type: 'farkle', playerId: actorId, lost: before.thisTurn },
      { type: 'turn_completed', playerId: actorId },
    ],
  };
}

function mount(before: FarkleState, userId: string) {
  const props = { scope, incoming: before, revision: 1, players, currentUserId: userId,
    isPaused: false, isRealMoney: false, onRefetch: vi.fn() };
  const view = render(<CanonicalAnnouncementProvider dealerGameId={scope.gameId} roundId={scope.roundId}>
    <NoticeProbe /><FarkleGameTable {...props} />
  </CanonicalAnnouncementProvider>);
  return { ...view, update: (next: FarkleState) => view.rerender(
    <CanonicalAnnouncementProvider dealerGameId={scope.gameId} roundId={scope.roundId}>
      <NoticeProbe /><FarkleGameTable {...props} incoming={next} revision={next.actionSequence} />
    </CanonicalAnnouncementProvider>),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('Farkle terminal roll presentation ownership', () => {
  it.each([
    ['self', 'one die', 'user-0', first, [{ index: 4, value: 2 }]],
    ['self', 'partial', 'user-0', first, [{ index: 2, value: 2 }, { index: 5, value: 3 }]],
    ['self', 'six dice', 'user-0', first, [2, 3, 4, 6, 2, 3].map((value, index) => ({ index, value }))],
    ['remote', 'one die', 'user-0', second, [{ index: 4, value: 2 }]],
    ['remote', 'partial', 'user-0', second, [{ index: 1, value: 2 }, { index: 4, value: 3 }]],
    ['remote', 'six dice', 'user-0', second, [2, 3, 4, 6, 2, 3].map((value, index) => ({ index, value }))],
  ] as const)('keeps a %s %s Farkle on its actor surface through canonical notice retirement', async (owner, _, userId, actor, dice) => {
    const before = farkleTestState(); before.currentTurnPlayerId = actor; before.stage = 'roll'; before.dice = [];
    const view = mount(before, userId);
    view.update(terminalRoll(before, [...dice]));
    const surface = owner === 'self' ? '[data-farkle-active-area]' : '[data-farkle-roll-phase]';
    const other = owner === 'self' ? '[data-farkle-roll-phase]' : '[data-farkle-active-area]';
    expect(document.querySelector(surface)).toBeTruthy();
    expect(document.querySelector(other)).toBeNull();
    expect(screen.queryByText('FARKLE')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(document.querySelector(surface)).toBeTruthy();
    const rendered = [...document.querySelectorAll(`${surface} [data-farkle-die-index]`)]
      .filter(node => node.getAttribute('aria-label')?.includes(': '))
      .map(node => [Number(node.getAttribute('data-farkle-die-index')), Number(node.getAttribute('aria-label')?.split(': ')[1])]);
    expect(rendered.sort((a, b) => a[0] - b[0])).toEqual(dice.map(die => [die.index, die.value]).sort((a, b) => a[0] - b[0]));
    expect(document.querySelectorAll(`${surface} .farkle-die`)).toHaveLength(dice.length);
    expect(screen.getByText('FARKLE')).toBeVisible();
    if (owner === 'remote') expect(document.querySelector('[data-farkle-roll-phase]')?.getAttribute('data-farkle-roll-phase')).toBe('row');
    await act(async () => { await vi.advanceTimersByTimeAsync(1599); });
    expect(document.querySelector(surface)).toBeTruthy();
    expect(screen.getByText('FARKLE')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByText('FARKLE')).toBeNull();
    expect(document.querySelector(surface)).toBeNull();
    expect(document.querySelector(other)).toBeTruthy();
  });

  it('does not replay a prior Farkle receipt on reconnect', async () => {
    const before = farkleTestState();
    const ended = terminalRoll(before, [{ index: 0, value: 2 }]);
    mount(ended, 'user-0');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.queryByText('FARKLE')).toBeNull();
    expect(document.querySelector('[data-farkle-resolved-roll]')).toBeNull();
  });

  it('ignores retirement of an older Farkle while a newer receipt is presented', async () => {
    const before = farkleTestState(); before.stage = 'roll'; before.dice = [];
    const view = mount(before, 'user-0');
    const firstRoll = terminalRoll(before, [{ index: 2, value: 2 }]);
    view.update(firstRoll);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText('FARKLE')).toBeVisible();
    const secondRoll = terminalRoll(firstRoll, [{ index: 3, value: 3 }]);
    view.update(secondRoll);
    expect(document.querySelector('[data-farkle-roll-phase]')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    // The first notice expired, but its callback cannot clear the second actor's dice.
    expect(document.querySelector('[data-farkle-roll-phase]')).toBeTruthy();
    expect(document.querySelector('[data-farkle-roll-phase] [aria-label="Die 4: 3"]')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(document.querySelector('[data-farkle-roll-phase]')).toBeNull();
    expect(document.querySelector('[data-farkle-active-area]')).toBeTruthy();
  });
});
