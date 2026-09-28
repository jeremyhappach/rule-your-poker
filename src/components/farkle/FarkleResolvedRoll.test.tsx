// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalAnnouncementProvider, useAnnouncementContext } from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import { renderAnnouncement } from '@/lib/canonicalShell/announcements/renderers';
import { _setFromRemote } from '@/lib/geometryLab/defaultsRegistry';
import { FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS, FARKLE_BLOCKING_OVERLAY_TIMING_KEY } from '@/lib/farkle/blockingOverlayTiming';
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
  return { ...view, update: (next: FarkleState, nextScope = scope) => view.rerender(
    <CanonicalAnnouncementProvider dealerGameId={nextScope.gameId} roundId={nextScope.roundId}>
      <NoticeProbe /><FarkleGameTable {...props} scope={nextScope} incoming={next} revision={next.actionSequence} />
    </CanonicalAnnouncementProvider>),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  _setFromRemote(FARKLE_BLOCKING_OVERLAY_TIMING_KEY, FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS, { isInitialFetch: true, rowExists: false });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Farkle terminal roll presentation ownership', () => {
  it.each([
    ['self', 'one die', 'user-0', first, [{ index: 4, value: 2 }]],
    ['self', 'partial', 'user-0', first, [{ index: 2, value: 2 }, { index: 5, value: 3 }]],
    ['self', 'six dice', 'user-0', first, [2, 3, 4, 6, 2, 3].map((value, index) => ({ index, value }))],
    ['remote', 'one die', 'user-0', second, [{ index: 4, value: 2 }]],
    ['remote', 'partial', 'user-0', second, [{ index: 1, value: 2 }, { index: 4, value: 3 }]],
    ['remote', 'six dice', 'user-0', second, [2, 3, 4, 6, 2, 3].map((value, index) => ({ index, value }))],
  ] as const)('keeps a %s %s Farkle on its actor surface through blocking-overlay retirement', async (owner, _, userId, actor, dice) => {
    const before = farkleTestState(); before.currentTurnPlayerId = actor; before.stage = 'roll'; before.dice = [];
    const view = mount(before, userId);
    view.update(terminalRoll(before, [...dice]));
    const surface = owner === 'self' ? '[data-farkle-active-area]' : '[data-farkle-roll-phase]';
    const other = owner === 'self' ? '[data-farkle-roll-phase]' : '[data-farkle-active-area]';
    expect(document.querySelector(surface)).toBeTruthy();
    expect(document.querySelector(other)).toBeNull();
    expect(screen.queryByText('FARKLE!')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(document.querySelector(surface)).toBeTruthy();
    const rendered = [...document.querySelectorAll(`${surface} [data-farkle-die-index]`)]
      .filter(node => node.getAttribute('aria-label')?.includes(': '))
      .map(node => [Number(node.getAttribute('data-farkle-die-index')), Number(node.getAttribute('aria-label')?.split(': ')[1])]);
    expect(rendered.sort((a, b) => a[0] - b[0])).toEqual(dice.map(die => [die.index, die.value]).sort((a, b) => a[0] - b[0]));
    expect(document.querySelectorAll(`${surface} .farkle-die`)).toHaveLength(dice.length);
    expect(screen.getByText('FARKLE!')).toBeVisible();
    expect(document.querySelector('[data-farkle-blocking-overlay="farkle"]')).toHaveAttribute('data-farkle-overlay-duration', '1900');
    if (owner === 'remote') expect(document.querySelector('[data-farkle-roll-phase]')?.getAttribute('data-farkle-roll-phase')).toBe('row');
    await act(async () => { await vi.advanceTimersByTimeAsync(1899); });
    expect(document.querySelector(surface)).toBeTruthy();
    expect(screen.getByText('FARKLE!')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByText('FARKLE!')).toBeNull();
    expect(document.querySelector(surface)).toBeNull();
    expect(document.querySelector(other)).toBeTruthy();
  });

  it('does not replay a prior Farkle receipt on reconnect', async () => {
    const before = farkleTestState();
    const ended = terminalRoll(before, [{ index: 0, value: 2 }]);
    mount(ended, 'user-0');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.queryByText('FARKLE!')).toBeNull();
    expect(document.querySelector('[data-farkle-resolved-roll]')).toBeNull();
  });

  it('ignores retirement of an older Farkle while a newer receipt is presented', async () => {
    const before = farkleTestState(); before.stage = 'roll'; before.dice = [];
    const view = mount(before, 'user-0');
    const firstRoll = terminalRoll(before, [{ index: 2, value: 2 }]);
    view.update(firstRoll);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText('FARKLE!')).toBeVisible();
    const secondRoll = terminalRoll(firstRoll, [{ index: 3, value: 3 }]);
    view.update(secondRoll);
    expect(document.querySelector('[data-farkle-roll-phase]')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText('FARKLE!')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1899); });
    // The older receipt cannot clear the newer actor's dice or overlay.
    expect(document.querySelector('[data-farkle-roll-phase]')).toBeTruthy();
    expect(document.querySelector('[data-farkle-roll-phase] [aria-label="Die 4: 3"]')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(document.querySelector('[data-farkle-roll-phase]')).toBeNull();
    expect(document.querySelector('[data-farkle-active-area]')).toBeTruthy();
  });

  it('uses the committed Farkle Geometry Lab duration for a BANKED receipt', async () => {
    _setFromRemote(FARKLE_BLOCKING_OVERLAY_TIMING_KEY, { displayLifetimeMs: 2450 });
    const before = farkleTestState();
    const view = mount(before, 'user-0');
    view.update(bankedState(before, 1250));
    expect(screen.getByText('BANKED')).toBeVisible();
    expect(screen.getByText('+1,250')).toBeVisible();
    const overlay = document.querySelector('[data-farkle-blocking-overlay="banked"]');
    expect(overlay).toHaveAttribute('data-farkle-overlay-duration', '2450');
    await act(async () => { await vi.advanceTimersByTimeAsync(2449); });
    expect(overlay).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(document.querySelector('[data-farkle-blocking-overlay]')).toBeNull();
  });
});

function bankedState(before: FarkleState, points: number): FarkleState {
  const actorId = before.currentTurnPlayerId;
  return { ...before, actionSequence: before.actionSequence + 1,
    currentTurnPlayerId: actorId === first ? second : first, stage: 'roll', dice: [],
    available: [0, 1, 2, 3, 4, 5], rollNumber: 0, thisTurn: 0,
    events: [{ type: 'banked', playerId: actorId, points }, { type: 'turn_completed', playerId: actorId }],
  };
}

function heldState(before: FarkleState, indexes = [0]): FarkleState {
  return { ...before, actionSequence: before.actionSequence + 1, stage: 'bank_or_roll',
    available: before.available.filter(index => !indexes.includes(index)), thisTurn: before.thisTurn + 100 * indexes.length,
    events: [{ type: 'dice_held', playerId: before.currentTurnPlayerId, indexes, points: 100 * indexes.length, rollNumber: before.rollNumber }],
  };
}
function followUpRoll(before: FarkleState, dice: FarkleDie[]): FarkleState {
  return { ...before, actionSequence: before.actionSequence + 1, stage: 'hold', dice,
    available: dice.map(die => die.index), rollNumber: before.rollNumber + 1,
    events: [{ type: 'dice_rolled', playerId: before.currentTurnPlayerId, dice, rollNumber: before.rollNumber + 1 }],
  };
}
function centeredSlots(length: number) {
  return Array.from({ length }, (_, slot) => `${50 + (slot - (length - 1) / 2) * (100 / 6)}%`);
}
const remoteHeld = () => document.querySelector('.farkle-remote-die:has([data-farkle-die="0"])')!;

describe('Farkle live remote Hold retirement', () => {
  it.each([[[0]], [[0, 1]]])('keeps scoring dice %j green for 1.4 seconds, then dissolves without moving survivor slots', async (indexes) => {
    const before = farkleTestState();
    const view = mount(before, 'user-1');
    const remote = document.querySelector('.farkle-remote-stage')!;
    const slotsBeforeHold = new Map([...remote.querySelectorAll<HTMLElement>(':scope > .farkle-remote-die')]
      .map(die => [Number(die.querySelector('[data-farkle-die]')?.getAttribute('data-farkle-die')), die.style.getPropertyValue('--farkle-row-x')]));
    const held = heldState(before, indexes);
    view.update(held);
    expect(screen.getByText(`THIS TURN +${100 * indexes.length}`)).toBeVisible();
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'scoring');
    expect(remoteHeld().querySelector('.farkle-die')).toHaveAttribute('data-scoring', 'true');
    expect(remoteHeld().querySelector('.farkle-die')).toHaveAttribute('data-retired', 'false');
    expect(document.querySelectorAll('.farkle-remote-die [data-scoring="true"]')).toHaveLength(indexes.length);
    view.update(structuredClone(held));
    await act(async () => { await vi.advanceTimersByTimeAsync(1399); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'scoring');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'dissolving');
    expect(remoteHeld().querySelector('.farkle-die')).toHaveAttribute('data-scoring', 'true');
    expect(remoteHeld().querySelector('.farkle-die')).toHaveAttribute('data-retired', 'false');
    expect(remoteHeld()).toHaveAttribute('aria-hidden', 'true');
    const survivors = [...remote.querySelectorAll(':scope > .farkle-remote-die:not([data-hold-phase])')];
    expect(survivors).toHaveLength(6 - indexes.length);
    expect(survivors.map(die => (die as HTMLElement).style.getPropertyValue('--farkle-row-x')))
      .toEqual(survivors.map(die => slotsBeforeHold.get(Number(die.querySelector('[data-farkle-die]')?.getAttribute('data-farkle-die')))));
    await act(async () => { await vi.advanceTimersByTimeAsync(240); });
    expect(remote.querySelector('.farkle-remote-hold-dissolving-layer')).toBeNull();
    expect(remote.querySelectorAll(':scope > .farkle-remote-die')).toHaveLength(6 - indexes.length);
  });

  it('waits for a queued scoring notice instead of expiring the remote highlight early', async () => {
    const errors = vi.spyOn(console, 'error');
    const before = farkleTestState();
    const view = mount(before, 'user-1');
    const queued = { ...before, actionSequence: 2, events: [{ type: 'dice_held', playerId: first, indexes: [0], points: 50 }] };
    view.update(queued);
    view.update(heldState(queued));
    expect(screen.getByText('THIS TURN +50')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(screen.getByText('THIS TURN +100')).toBeVisible();
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'scoring');
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'dissolving');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('keeps final-die admission scheduled when the previous notice retires during the roll', async () => {
    const before = { ...farkleTestState(), stage: 'bank_or_roll' as const, available: [0], dice: [], thisTurn: 400 };
    const view = mount(before, 'user-1');
    const queued = { ...before, actionSequence: 2, events: [{ type: 'dice_held', playerId: first, indexes: [0], points: 50 }] };
    view.update(queued);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const dice = [{ index: 0, value: 1 }];
    const held = heldState(queued);
    view.update({ ...held, dice, rollNumber: before.rollNumber + 1, available: [0,1,2,3,4,5], scoringCycle: 2,
      events: [{ type: 'dice_rolled', playerId: first, dice, rollNumber: before.rollNumber + 1 }, ...held.events!, { type: 'hot_dice' }] });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText('THIS TURN +100')).toBeVisible();
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'scoring');
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'dissolving');
  });

  it('acknowledges automatic final-die Hold after the die reaches the row', async () => {
    const before = { ...farkleTestState(), stage: 'bank_or_roll' as const, available: [0], dice: [], thisTurn: 400 };
    const view = mount(before, 'user-1');
    const dice = [{ index: 0, value: 1 }];
    const held = heldState(before);
    view.update({ ...held, dice, rollNumber: before.rollNumber + 1, available: [0,1,2,3,4,5], scoringCycle: 2,
      events: [{ type: 'dice_rolled', playerId: first, dice, rollNumber: before.rollNumber + 1 }, ...held.events!, { type: 'hot_dice' }] });
    expect(screen.queryByText('THIS TURN +100')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(document.querySelector('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase', 'row');
    expect(screen.getByText('THIS TURN +100')).toBeVisible();
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'scoring');
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'dissolving');
    expect(screen.getByText('HOT DICE!')).toBeVisible();
  });

  it('does not let the prior notice retire a newer roll using the same die index', async () => {
    const before = farkleTestState();
    const view = mount(before, 'user-1');
    const held = heldState(before);
    view.update(held);
    const next = { ...before, actionSequence: 3, rollNumber: 2, events: [] };
    view.update(next);
    view.update(heldState(next));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'scoring');
    await act(async () => { await vi.advanceTimersByTimeAsync(1900); });
    expect(remoteHeld()).toHaveAttribute('data-hold-phase', 'dissolving');
  });

  it('clears Hold presentation at a new dealer-game/round identity', async () => {
    const before = farkleTestState();
    const view = mount(before, 'user-1');
    view.update(heldState(before));
    view.update({ ...before, _authorityScope: 'next-round' }, { ...scope, dealerGameId: 'next-dealer', roundId: 'next-round' });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(document.querySelector('[data-hold-phase]')).toBeNull();
    expect(document.querySelector('[data-scoring="true"]')).toBeNull();
  });

  it('preserves reconnect rendering without replaying a scoring acknowledgment', async () => {
    mount(heldState(farkleTestState()), 'user-1');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByText('THIS TURN +100')).toBeNull();
    expect(document.querySelector('[data-hold-phase]')).toBeNull();
    expect(remoteHeld().querySelector('.farkle-die')).toHaveAttribute('data-retired', 'true');
  });

  it('reconnects during a self scoring cycle with only available dice, without replaying the acknowledgment', () => {
    mount(heldState(farkleTestState(), [1, 4]), 'user-0');
    const selfRow = document.querySelector('.farkle-self-dice')!;
    expect(selfRow).not.toHaveAttribute('data-farkle-self-hold-phase');
    expect([...selfRow.querySelectorAll(':scope > [data-farkle-die]')]
      .map(die => Number(die.getAttribute('data-farkle-die')))).toEqual([0, 2, 3, 5]);
    expect(screen.queryByText('THIS TURN +200')).toBeNull();
  });

  it.each([[[0], [1, 2, 3, 4, 5]], [[1, 4], [0, 2, 3, 5]]])('dissolves self-held dice %j while keeping available dice in their original slots %j', async (indexes, remaining) => {
    const before = farkleTestState();
    const view = mount(before, 'user-0');
    const selfRow = () => document.querySelector('.farkle-self-dice')!;
    const actionSlot = () => view.container.querySelector('[data-farkle-self-action-slot]')!;
    const slotsBeforeHold = new Map([...selfRow().querySelectorAll<HTMLElement>(':scope > [data-farkle-die]')]
      .map(die => [Number(die.getAttribute('data-farkle-die')), die.style.getPropertyValue('--farkle-self-slot-x')]));
    view.update(heldState(before, indexes));
    expect(selfRow()).toHaveAttribute('data-farkle-self-hold-phase', 'scoring');
    expect(actionSlot()).toHaveClass('h-10');
    expect(actionSlot()).toHaveAttribute('data-farkle-actions-ready', 'false');
    expect(actionSlot()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: `Roll ${remaining.length}` })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bank' })).toBeNull();
    expect([...selfRow().querySelectorAll(':scope > [data-farkle-die]')]
      .filter(die => indexes.includes(Number(die.getAttribute('data-farkle-die'))))
      .every(die => die.getAttribute('data-scoring') === 'true')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(selfRow()).toHaveAttribute('data-farkle-self-hold-phase', 'dissolving');
    expect([...selfRow().querySelectorAll(':scope > [data-farkle-die]')]
      .map(die => Number(die.getAttribute('data-farkle-die')))).toEqual(remaining);
    expect([...selfRow().querySelectorAll<HTMLElement>(':scope > [data-farkle-die]')]
      .map(die => die.style.getPropertyValue('--farkle-self-slot-x')))
      .toEqual(remaining.map(index => slotsBeforeHold.get(index)));
    expect(selfRow().querySelectorAll('.farkle-self-hold-dissolving [data-scoring="true"]')).toHaveLength(indexes.length);
    expect(screen.queryByRole('button', { name: `Roll ${remaining.length}` })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(240); });
    expect(selfRow()).not.toHaveAttribute('data-farkle-self-hold-phase');
    expect(selfRow().querySelector('[data-retired="true"]')).toBeNull();
    expect(actionSlot()).toHaveAttribute('data-farkle-actions-ready', 'true');
    expect(screen.getByRole('button', { name: `Roll ${remaining.length}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Bank' })).toBeEnabled();
  });

  it('removes the final self-held die before the queued Hot Dice acknowledgment and preserves Roll 6', async () => {
    const before = { ...farkleTestState(), stage: 'bank_or_roll' as const, available: [0], dice: [], thisTurn: 400 };
    const view = mount(before, 'user-0');
    const dice = [{ index: 0, value: 1 }];
    const held = heldState(before);
    const hot = { ...held, dice, rollNumber: before.rollNumber + 1, available: [0, 1, 2, 3, 4, 5], scoringCycle: 2,
      events: [{ type: 'dice_rolled', playerId: first, dice, rollNumber: before.rollNumber + 1 }, ...held.events!, { type: 'hot_dice' }] };
    view.update(hot);
    expect(screen.queryByText('THIS TURN +100')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    const selfRow = () => document.querySelector('.farkle-self-dice')!;
    expect(screen.getByText('THIS TURN +100')).toBeVisible();
    expect(selfRow()).toHaveAttribute('data-farkle-self-hold-phase', 'scoring');
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText('HOT DICE!')).toBeVisible();
    expect(selfRow()).toHaveAttribute('data-farkle-self-hold-phase', 'dissolving');
    expect(selfRow().querySelector(':scope > [data-farkle-die="0"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Roll 6' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(240); });
    expect(selfRow().querySelector('[data-farkle-die="0"]')).toBeNull();
    expect(selfRow()).toHaveAttribute('data-farkle-self-hold-phase', 'retired');
    expect(screen.queryByRole('button', { name: 'Roll 6' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1659); });
    expect(screen.queryByRole('button', { name: 'Roll 6' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('button', { name: 'Roll 6' })).toBeEnabled();
  });

  it('does not let a prior self Hold retirement gate controls for a newer roll state', async () => {
    const before = farkleTestState();
    const view = mount(before, 'user-0');
    view.update(heldState(before));
    const next = { ...before, actionSequence: 3, stage: 'bank_or_roll' as const, rollNumber: 2, events: [] };
    view.update(next);
    expect(screen.getByRole('button', { name: 'Roll 6' })).toBeEnabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByRole('button', { name: 'Roll 6' })).toBeEnabled();
  });

  it('starts a self follow-up roll in a fresh centered row after held slots retire', async () => {
    const before = farkleTestState();
    const view = mount(before, 'user-0');
    view.update(heldState(before, [1, 4]));
    await act(async () => { await vi.advanceTimersByTimeAsync(1140); });
    const dice = [{ index: 0, value: 6 }, { index: 2, value: 1 }, { index: 3, value: 3 }, { index: 5, value: 5 }];
    view.update(followUpRoll(heldState(before, [1, 4]), dice));
    const selfRow = document.querySelector('.farkle-self-dice')!;
    const slotXs = () => [...selfRow.querySelectorAll<HTMLElement>(':scope > [data-farkle-die]')]
      .map(die => die.style.getPropertyValue('--farkle-self-slot-x'));
    expect(slotXs()).toEqual(centeredSlots(dice.length));
    expect(selfRow).toHaveAttribute('data-farkle-self-roll-phase', 'cluster');
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(selfRow).toHaveAttribute('data-farkle-self-roll-phase', 'rumble');
    expect(slotXs()).toEqual(centeredSlots(dice.length));
    await act(async () => { await vi.advanceTimersByTimeAsync(670); });
    expect(selfRow).toHaveAttribute('data-farkle-self-roll-phase', 'row');
    expect(slotXs()).toEqual(centeredSlots(dice.length));
  });

  it('starts a remote follow-up roll in a fresh centered row after held slots retire', async () => {
    const before = farkleTestState();
    const view = mount(before, 'user-1');
    view.update(heldState(before, [1, 4]));
    await act(async () => { await vi.advanceTimersByTimeAsync(1640); });
    const dice = [{ index: 0, value: 6 }, { index: 2, value: 1 }, { index: 3, value: 3 }, { index: 5, value: 5 }];
    view.update(followUpRoll(heldState(before, [1, 4]), dice));
    const remote = document.querySelector('.farkle-remote-stage')!;
    const slotXs = () => [...remote.querySelectorAll<HTMLElement>(':scope > .farkle-remote-die')]
      .map(die => die.style.getPropertyValue('--farkle-row-x'));
    expect(remote).toHaveAttribute('data-farkle-fresh-roll', 'true');
    expect(remote).toHaveAttribute('data-farkle-roll-phase', 'cluster');
    expect(remote.querySelector('[data-hold-phase]')).toBeNull();
    expect(slotXs()).toEqual(centeredSlots(dice.length));
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(remote).toHaveAttribute('data-farkle-roll-phase', 'rumble');
    expect(slotXs()).toEqual(centeredSlots(dice.length));
    await act(async () => { await vi.advanceTimersByTimeAsync(670); });
    expect(remote).toHaveAttribute('data-farkle-roll-phase', 'row');
    expect(slotXs()).toEqual(centeredSlots(dice.length));
  });

  it('keeps self survivors in their Roll 5 slots, then replaces them with a fresh Roll 3 row', async () => {
    const before = farkleTestState();
    const firstHold = heldState(before, [0]);
    const fiveDice = [1, 2, 3, 4, 5].map((value, offset) => ({ index: offset + 1, value }));
    const rolledFive = followUpRoll(firstHold, fiveDice);
    const secondHold = heldState(rolledFive, [2, 4]);
    const threeDice = [{ index: 1, value: 2 }, { index: 3, value: 4 }, { index: 5, value: 6 }];
    const view = mount(before, 'user-0');
    const selfRow = () => document.querySelector('.farkle-self-dice')!;
    const slotXs = () => [...selfRow().querySelectorAll<HTMLElement>(':scope > [data-farkle-die]')]
      .map(die => die.style.getPropertyValue('--farkle-self-slot-x'));

    view.update(firstHold);
    await act(async () => { await vi.advanceTimersByTimeAsync(1140); });
    view.update(rolledFive);
    expect(slotXs()).toEqual(centeredSlots(fiveDice.length));

    view.update(secondHold);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect([...selfRow().querySelectorAll(':scope > [data-farkle-die]')]
      .map(die => Number(die.getAttribute('data-farkle-die')))).toEqual([1, 3, 5]);
    expect(slotXs()).toEqual([centeredSlots(fiveDice.length)[0], centeredSlots(fiveDice.length)[2], centeredSlots(fiveDice.length)[4]]);
    expect([...selfRow().querySelectorAll<HTMLElement>('.farkle-self-hold-dissolving')]
      .map(die => die.style.getPropertyValue('--farkle-self-hold-x')))
      .toEqual([centeredSlots(fiveDice.length)[1], centeredSlots(fiveDice.length)[3]]);

    await act(async () => { await vi.advanceTimersByTimeAsync(240); });
    view.update(followUpRoll(secondHold, threeDice));
    expect(slotXs()).toEqual(centeredSlots(threeDice.length));
    expect(selfRow()).toHaveAttribute('data-farkle-self-roll-phase', 'cluster');
  });

  it('keeps remote survivors in their Roll 5 slots, then replaces them with a fresh Roll 3 row', async () => {
    const before = farkleTestState();
    const firstHold = heldState(before, [0]);
    const fiveDice = [1, 2, 3, 4, 5].map((value, offset) => ({ index: offset + 1, value }));
    const rolledFive = followUpRoll(firstHold, fiveDice);
    const secondHold = heldState(rolledFive, [2, 4]);
    const threeDice = [{ index: 1, value: 2 }, { index: 3, value: 4 }, { index: 5, value: 6 }];
    const view = mount(before, 'user-1');
    const remote = () => document.querySelector('.farkle-remote-stage')!;
    const slotXs = () => [...remote().querySelectorAll<HTMLElement>(':scope > .farkle-remote-die')]
      .map(die => die.style.getPropertyValue('--farkle-row-x'));

    view.update(firstHold);
    await act(async () => { await vi.advanceTimersByTimeAsync(1640); });
    view.update(rolledFive);
    expect(slotXs()).toEqual(centeredSlots(fiveDice.length));

    view.update(secondHold);
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect([...remote().querySelectorAll(':scope > .farkle-remote-die')]
      .map(die => Number(die.querySelector('[data-farkle-die]')?.getAttribute('data-farkle-die')))).toEqual([1, 3, 5]);
    expect(slotXs()).toEqual([centeredSlots(fiveDice.length)[0], centeredSlots(fiveDice.length)[2], centeredSlots(fiveDice.length)[4]]);

    await act(async () => { await vi.advanceTimersByTimeAsync(240); });
    view.update(followUpRoll(secondHold, threeDice));
    expect(slotXs()).toEqual(centeredSlots(threeDice.length));
    expect(remote()).toHaveAttribute('data-farkle-roll-phase', 'cluster');
  });

  it('reconnects immediately after Hot Dice with no stale die face and a clean Roll 6 state', () => {
    const before = { ...farkleTestState(), stage: 'bank_or_roll' as const, available: [0], dice: [], thisTurn: 400 };
    const dice = [{ index: 0, value: 1 }];
    const held = heldState(before);
    const hot = { ...held, dice, rollNumber: before.rollNumber + 1, available: [0, 1, 2, 3, 4, 5], scoringCycle: 2,
      events: [{ type: 'dice_rolled', playerId: first, dice, rollNumber: before.rollNumber + 1 }, ...held.events!, { type: 'hot_dice' }] };
    mount(hot, 'user-0');
    const selfRow = document.querySelector('.farkle-self-dice')!;
    expect(selfRow).toHaveAttribute('data-farkle-self-hold-phase', 'retired');
    expect(selfRow.querySelector('[data-farkle-die="0"]')).toBeNull();
    expect(screen.queryByText('THIS TURN +100')).toBeNull();
    expect(screen.getByRole('button', { name: 'Roll 6' })).toBeEnabled();
  });
});
