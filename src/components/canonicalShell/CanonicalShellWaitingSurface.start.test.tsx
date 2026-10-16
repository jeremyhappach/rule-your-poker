// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalShellWaitingSurface, type CanonicalShellWaitingSurfaceProps } from './CanonicalShellWaitingSurface';
import { WaitingForPlayersTable } from '../WaitingForPlayersTable';
import { CanonicalAnnouncementProvider, useAnnouncementContext, useAnnouncements } from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import { recordAnnouncementDebugEvent } from '@/lib/canonicalShell/announcements/announcementDebugLog';

const stable = vi.hoisted(() => ({
  announcements: { emit: vi.fn(), clearAmbient: vi.fn() },
  attention: { notifyActiveTab: vi.fn(), markChatRead: vi.fn(), attentionState: {} },
  anchors: { byPosition: new Map(), projectionMode: 'active-canonical', providerInstanceId: 'test' },
  rpc: vi.fn(async () => ({ data: false, error: null })),
  realAnnouncements: false,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: stable.rpc } }));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));
vi.mock('@/hooks/useDoorbellSound', () => ({ useDoorbellSound: () => ({ playDoorbell: vi.fn() }) }));
vi.mock('@/lib/canonicalShell/announcements/announcementDebugLog', () => ({ recordAnnouncementDebugEvent: vi.fn() }));
vi.mock('@/lib/canonicalShell/announcements', async () => {
  const actual = await vi.importActual<typeof import('@/lib/canonicalShell/announcements')>('@/lib/canonicalShell/announcements');
  return { ...actual, useAnnouncements: () => stable.realAnnouncements ? actual.useAnnouncements() : { ...stable.announcements } };
});
vi.mock('@/components/MobileGameTable', () => ({ MobileGameTable: ({ waitingActivePaneContent, waitingSlotContent }: any) => <>{waitingSlotContent}{waitingActivePaneContent}</> }));
vi.mock('@/lib/chatFlightRecorder', () => ({ ensureChatFlightRecorderArmed: vi.fn() }));
vi.mock('@/lib/canonicalShell/ShellOwnedFeltHost', () => ({ usePublishShellFelt: vi.fn(), deriveFeltGameKind: () => 'neutral' }));
vi.mock('@/lib/canonicalShell/ShellTabBar', () => ({ useShellTabBar: vi.fn() }));
vi.mock('@/lib/canonicalShell/ShellHudGrid', () => ({ ShellHudGrid: ({ pane }: any) => <div>{pane}</div> }));
vi.mock('@/components/MobileChatPanel', () => ({ MobileChatPanel: () => null }));
vi.mock('@/hooks/ChatAttention', () => ({ useChatAttention: () => stable.attention, useChatIconStyleGuard: vi.fn(), chatAttentionToShellTabProps: () => ({}) }));
vi.mock('@/lib/canonicalShell/SeatAnchorLayer', () => ({ useSeatAnchorsOptional: () => stable.anchors }));
vi.mock('@/lib/canonicalShell/PreSessionSeatLayer', () => ({ usePreSessionSeatOwned: () => true }));
vi.mock('@/lib/canonicalShell/CanonicalSeatCluster', () => ({ CanonicalSeatCluster: () => null }));
vi.mock('@/lib/canonicalShell/PresentationChipBalance', () => ({ PresentationChipBalance: () => null }));
vi.mock('@/lib/wartimeDebug/core', () => ({ recordWartime: vi.fn() }));
vi.mock('@/lib/wartimeDebug/surfaces', () => ({ recordPlayerVisualSnapshot: vi.fn(), probeChipDom: vi.fn(), probeChipDomAncestry: vi.fn() }));
vi.mock('@/lib/canonicalShell/waitingTableFlight', () => ({ useWaitingMount: vi.fn(), recordWaitingLifecycle: vi.fn(), recordWaitingLifecycleIfChanged: vi.fn(), recordSurfaceOwnership: vi.fn(), recordSurfaceGeometry: vi.fn() }));

const initial = () => [
  { id: 'a', user_id: 'a', position: 4, status: 'active', is_bot: false, sitting_out: false, waiting: false, chips: 0, created_at: '2026-09-29T17:01:00Z' },
  { id: 'b', user_id: 'b', position: 7, status: 'active', is_bot: false, sitting_out: false, waiting: false, chips: 0, created_at: '2026-09-29T17:01:01Z' },
];
const boundary = { status: 'waiting', current_game_uuid: null, pot: 0 };
const noop = () => {};
function surface(players: ReturnType<typeof initial>, viewer: string, host = 'a', start = noop, extra: Partial<CanonicalShellWaitingSurfaceProps> = {}) {
  return <CanonicalShellWaitingSurface gameId="fixture" gameType={null} players={players} currentUserId={viewer}
    currentHost={host} startBoundary={boundary} onSelectSeat={noop} onGameStart={start} realMoney {...extra} />;
}
async function starters(players: ReturnType<typeof initial>, host = 'a') {
  const result: string[] = [];
  for (const viewer of ['a', 'b']) {
    const mounted = render(surface(players, viewer, host));
    await act(async () => {});
    const has = !!screen.queryByRole('button', { name: /Start Game/ });
    mounted.unmount();
    if (has) result.push(viewer);
  }
  return result;
}
beforeEach(() => { vi.clearAllMocks(); stable.realAnnouncements = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); stable.rpc.mockReset().mockResolvedValue({ data: false, error: null }); });

function pendingRead() {
  let resolve!: (result: { data: boolean; error: null }) => void;
  stable.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  return async (data = false) => { await act(async () => resolve({ data, error: null })); };
}
const startButton = () => screen.queryByRole('button', { name: /Start Game/ });

describe('canonical waiting start controls with the real action hook', () => {
  it.each([0, 1])('completion → dealer sit-out → peer %i timeout → rejoin; one starter survives reload', async disconnected => {
    const players = initial();
    const dealer = 1 - disconnected;
    expect(await starters(players)).toEqual(['a']);
    players[dealer].sitting_out = true;
    expect(await starters(players)).toEqual([]); // only one eligible player
    players[disconnected].sitting_out = true;
    expect(await starters(players)).toEqual([]);
    players[disconnected].waiting = true;
    expect(await starters(players)).toEqual([]); // the explicit sitter has not opted back in
    players[dealer].waiting = true;
    expect(await starters(players)).toEqual(['a']);
    // Fresh mounts and reversed network row order reconstruct the same sole authority.
    expect(await starters(JSON.parse(JSON.stringify(players)).reverse())).toEqual(['a']);
  });
  it('renders the exact captured seat-release/reseat state and sends one start intent', async () => {
    vi.useFakeTimers();
    const players = initial();
    players[0].sitting_out = true;
    players[0].waiting = true;
    players[1].waiting = true;
    players[1].position = 5;
    const start = vi.fn();
    const mounted = render(surface(players, 'a', 'a', start));
    await act(async () => {});
    expect(stable.announcements.emit).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { text: 'Ready to Start!', subtitle: '2 players seated' } }));
    const button = screen.getByRole('button', { name: /Start Game/ });
    fireEvent.click(button);
    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(500));
    expect(start).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(await starters(players)).toEqual(['a']);
  });
  it('moves the visible action with authoritative host transfer', async () => {
    expect(await starters(initial(), 'b')).toEqual(['b']);
  });
  it('allows the backend-selected fallback while keeping bot controls with the host', async () => {
    const players = initial();
    players[0].sitting_out = true;
    players.push({ ...players[1], id: 'c', user_id: 'c', position: 2 });
    expect(await starters(players)).toEqual(['b']);
  });
  it('reconciles an already-mounted queued host when the peer rejoins', async () => {
    const players = initial();
    players[0].sitting_out = true;
    players[0].waiting = true;
    players[1].sitting_out = true;
    const mounted = render(surface(players, 'a'));
    expect(screen.queryByRole('button', { name: /Start Game/ })).toBeNull();
    mounted.rerender(surface(players.map(p => p.id === 'b' ? { ...p, waiting: true } : p), 'a'));
    await act(async () => {});
    expect(screen.getByRole('button', { name: /Start Game/ })).toBeTruthy();
  });
  it('hides Ready and Start when the server reports an unfinished round or pending money', async () => {
    stable.rpc.mockResolvedValue({ data: true, error: null });
    expect(await starters(initial())).toEqual([]);
    expect(stable.announcements.emit).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ text: 'Waiting for Players' }) }));
  });
  it('fails closed on a read error and ignores an old read after a new snapshot', async () => {
    let resolveOld!: (value: { data: boolean; error: null }) => void;
    stable.rpc.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const players = initial();
    const mounted = render(surface(players, 'a'));
    expect(screen.queryByRole('button', { name: /Start Game/ })).toBeNull();
    stable.rpc.mockRejectedValueOnce(new Error('offline'));
    mounted.rerender(surface([...players], 'a'));
    await act(async () => {});
    await act(async () => { resolveOld({ data: false, error: null }); });
    expect(screen.queryByRole('button', { name: /Start Game/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry start check' }));
    await act(async () => {});
    expect(screen.getByRole('button', { name: /Start Game/ })).toBeTruthy();
  });

  it.each(['players', 'boundary', 'both', 'row order'])('preserves Ready during delayed identical %s refreshes and still rechecks', async kind => {
    let players = initial();
    let start = boundary;
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    const button = startButton();
    const emits = stable.announcements.emit.mock.calls.length;
    const clears = stable.announcements.clearAmbient.mock.calls.length;
    for (let i = 0; i < 4; i++) {
      const complete = pendingRead();
      if (kind !== 'boundary') players = players.map(p => ({ ...p }));
      if (kind === 'row order') players.reverse();
      if (kind === 'boundary' || kind === 'both') start = { ...start };
      mounted.rerender(surface(players, 'a', 'a', noop, { startBoundary: start }));
      expect(startButton()).toBe(button);
      await complete();
      expect(startButton()).toBe(button);
    }
    expect(stable.rpc).toHaveBeenCalledTimes(5);
    expect(stable.announcements.emit).toHaveBeenCalledTimes(emits);
    expect(stable.announcements.clearAmbient).toHaveBeenCalledTimes(clears);
  });

  it.each(['host', 'viewer', 'player UUID', 'seat', 'join order', 'session', 'transfer cursor'])('revokes an existing proof immediately on %s changes', async kind => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    expect(startButton()).toBeTruthy();
    const complete = pendingRead();
    const next = players.map(p => ({ ...p }));
    if (kind === 'player UUID') next[1].id = 'new-player-row';
    if (kind === 'seat') next[1].position = 2;
    if (kind === 'join order') next[1].created_at = '2026-09-29T17:00:00Z';
    mounted.rerender(surface(next, kind === 'viewer' ? 'b' : 'a', kind === 'host' ? 'b' : 'a', noop,
      kind === 'session' ? { gameId: 'next-session' } : kind === 'transfer cursor' ? { startBoundary: { ...boundary, chip_transfer_cursor: 1 } } : {}));
    expect(startButton()).toBeNull();
    await complete();
    expect(!!startButton()).toBe(!['host', 'viewer'].includes(kind));
  });

  it.each([
    { status: 'in_progress' }, { status: 'session_ended' }, { current_game_uuid: 'live-game' },
    { pot: 1 }, { is_paused: true }, { pending_session_end: true }, { session_ended_at: 'ended' },
  ])('revokes Ready immediately for boundary %j', async changed => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    mounted.rerender(surface(players, 'a', 'a', noop, { startBoundary: { ...boundary, ...changed } }));
    expect(startButton()).toBeNull();
    expect(stable.announcements.emit).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ text: 'Waiting for Players' }) }));
  });

  it.each(['departure', 'sit out'])('revokes on %s even if the array reference is reused', async kind => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    if (kind === 'departure') players[1].status = 'left';
    else players[1].sitting_out = true;
    mounted.rerender(surface(players, 'a'));
    expect(startButton()).toBeNull();
  });

  it('does not reuse a cached A proof or an old response after A → B → A', async () => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    const oldA = pendingRead();
    mounted.rerender(surface([...players], 'a'));
    const oldB = pendingRead();
    mounted.rerender(surface(players, 'a', 'b'));
    const newA = pendingRead();
    mounted.rerender(surface(players, 'a'));
    expect(startButton()).toBeNull();
    await oldA(); await oldB();
    expect(startButton()).toBeNull();
    await newA();
    expect(startButton()).toBeTruthy();
  });

  it('processes a blocked response even when latency spans another identical refresh', async () => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    const slow = pendingRead();
    mounted.rerender(surface([...players], 'a'));
    const newer = pendingRead();
    mounted.rerender(surface([...players], 'a'));
    expect(startButton()).toBeTruthy();
    await slow(true);
    expect(startButton()).toBeNull();
    await newer();
    expect(startButton()).toBeTruthy();
  });

  it('processes a slow RPC error without waiting for an even later pending read', async () => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    let fail!: (error: Error) => void;
    stable.rpc.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    mounted.rerender(surface([...players], 'a'));
    const newer = pendingRead();
    mounted.rerender(surface([...players], 'a'));
    await act(async () => fail(new Error('delayed network failure')));
    expect(startButton()).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry start check' })).toBeTruthy();
    await newer();
    expect(startButton()).toBeTruthy();
  });

  it.each(['blocked', 'error', 'malformed'])('revokes cached success on a genuine %s recheck and rejects older success', async outcome => {
    const players = initial();
    const mounted = render(surface(players, 'a'));
    await act(async () => {});
    const old = pendingRead();
    mounted.rerender(surface([...players], 'a'));
    if (outcome === 'error') stable.rpc.mockRejectedValueOnce(new Error('offline'));
    else stable.rpc.mockResolvedValueOnce({ data: outcome === 'blocked' ? true : null as any, error: null });
    mounted.rerender(surface([...players], 'a'));
    await act(async () => {});
    expect(startButton()).toBeNull();
    await old();
    expect(startButton()).toBeNull();
    if (outcome !== 'blocked') {
      const retry = pendingRead();
      fireEvent.click(screen.getByRole('button', { name: 'Retry start check' }));
      expect(startButton()).toBeNull();
      await retry();
      expect(startButton()).toBeTruthy();
    }
  });
});

let announcementApi: ReturnType<typeof useAnnouncements>;
function RealRailProbe() {
  announcementApi = useAnnouncements();
  const ctx = useAnnouncementContext();
  return <output data-testid="ambient">{(ctx?.ambient?.payload as { text?: string })?.text}</output>;
}
describe('both waiting presentations with the real announcement provider', () => {
  it.each(['canonical', 'legacy'])('%s keeps the ambient owner across refreshes and unrelated context updates', async kind => {
    stable.realAnnouncements = true;
    const players = initial();
    const start = vi.fn();
    const tree = (roster: typeof players, show = true) => <CanonicalAnnouncementProvider dealerGameId="fixture">
      <RealRailProbe />
      {show && (kind === 'canonical' ? surface(roster, 'a', 'a', start) : <WaitingForPlayersTable
        gameId="fixture" currentUserId="a" players={roster.map(p => ({ ...p, legs: 0, current_decision: null, decision_locked: false }))}
        onSelectSeat={noop} onGameStart={start} realMoney />)}
    </CanonicalAnnouncementProvider>;
    const mounted = render(tree(players));
    await act(async () => {});
    expect(screen.getByTestId('ambient').textContent).toBe('Ready to Start!');
    const calls = () => vi.mocked(recordAnnouncementDebugEvent).mock.calls.filter(([type, , detail]) =>
      (type === 'emit' || type === 'clearAmbient') && (detail as any)?.type === 'waiting_for_players');
    const count = calls().length;
    for (let i = 0; i < 3; i++) {
      mounted.rerender(tree(players.map(p => ({ ...p }))));
      await act(async () => {});
      expect(startButton()).toBeTruthy();
    }
    act(() => announcementApi.emit({ id: 'unrelated', type: 'peg_notice', scope: { dealerGameId: 'fixture' }, payload: { text: 'unrelated' } }));
    act(() => announcementApi.dismiss('unrelated'));
    expect(screen.getByTestId('ambient').textContent).toBe('Ready to Start!');
    expect(calls()).toHaveLength(count);
    vi.useFakeTimers();
    const button = startButton()!;
    fireEvent.click(button); fireEvent.click(button);
    act(() => vi.advanceTimersByTime(500));
    expect(start).toHaveBeenCalledTimes(1);
    mounted.rerender(tree(players, false));
    expect(screen.getByTestId('ambient').textContent).toBe('');
    expect(calls()).toHaveLength(count + 1);
  });
});
