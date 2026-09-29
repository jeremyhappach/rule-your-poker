// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanonicalShellWaitingSurface } from './CanonicalShellWaitingSurface';

const stable = vi.hoisted(() => ({
  announcements: { emit: vi.fn(), clearAmbient: vi.fn() },
  attention: { notifyActiveTab: vi.fn(), markChatRead: vi.fn(), attentionState: {} },
  anchors: { byPosition: new Map(), projectionMode: 'active-canonical', providerInstanceId: 'test' },
  rpc: vi.fn(async () => ({ data: false, error: null })),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: stable.rpc } }));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));
vi.mock('@/hooks/useDoorbellSound', () => ({ useDoorbellSound: () => ({ playDoorbell: vi.fn() }) }));
vi.mock('@/lib/canonicalShell/announcements/announcementDebugLog', () => ({ recordAnnouncementDebugEvent: vi.fn() }));
vi.mock('@/lib/canonicalShell/announcements', () => ({ useAnnouncements: () => stable.announcements }));
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
function surface(players: ReturnType<typeof initial>, viewer: string, host = 'a', start = noop) {
  return <CanonicalShellWaitingSurface gameId="fixture" gameType={null} players={players} currentUserId={viewer}
    currentHost={host} startBoundary={boundary} onSelectSeat={noop} onGameStart={start} realMoney />;
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
afterEach(() => { cleanup(); vi.useRealTimers(); stable.rpc.mockResolvedValue({ data: false, error: null }); });

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
});
