// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/canonicalShell/lifecycleDebug', () => ({ useLifecycleMount: vi.fn() }));
vi.mock('@/lib/canonicalShell/waitingTableFlight', () => ({ useWaitingMount: vi.fn(), recordSurfaceOwnership: vi.fn(), recordWaitingLifecycle: vi.fn() }));
vi.mock('@/lib/debugHarness/activeHarnessWarning', () => ({ useActiveHarnessMap: () => ({}), useActiveHarnessInfo: () => ({ active: false }) }));
vi.mock('@/lib/persistSyncDebugEvent', () => ({ persistSyncDebugEvent: vi.fn() }));
vi.mock('@/lib/startupFlightRecorder', () => ({ recordStartupFlight: vi.fn(), resetStartupFlight: vi.fn() }));
vi.mock('@/lib/dealerGameSetupAuthority', () => ({ configureDealerGame: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const response = { data: { ante_amount: 3, rollover_amount: 1, leg_value: 1, legs_to_win: 3,
      pussy_tax_enabled: true, pussy_tax_value: 1, pot_max_enabled: true, pot_max_value: 10, chucky_cards: 4,
      status: 'game_selection', config_complete: false }, error: null };
    const query: any = { select: () => query, eq: () => query, single: async () => response,
      maybeSingle: async () => response, then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) };
    return query;
  },
  channel: () => { const channel: any = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(), rpc: vi.fn(async () => ({ data: null, error: null })),
} }));

import { configureDealerGame } from '@/lib/dealerGameSetupAuthority';
import { resolveExactRunBackConfig } from '@/lib/dealerGameSetup/runBackConfig';
import { DealerGameSetup } from './DealerGameSetup';

const card = { ante_amount: 12, leg_value: 4, legs_to_win: 5, pussy_tax_enabled: false, pussy_tax_value: 0,
  pot_max_enabled: false, pot_max_value: 0 };
const crib = { ante_amount: 10, points_to_win: 37, game_mode: 'custom', custom_points_to_win: 37,
  skunk_enabled: false, skunk_threshold: 0, double_skunk_enabled: false, double_skunk_threshold: 0 };
const cases: Array<[string, Record<string, unknown>]> = [
  ['yahtzee', { ante_amount: 10 }],
  ['horses', { ante_amount: 11 }],
  ['ship-captain-crew', { ante_amount: 13 }],
  ['holm-game', { ...card, rollover_amount: null, chucky_cards: 7, rabbit_hunt: true, reveal_at_showdown: null }],
  ['3-5-7', { ...card, rollover_amount: 6, chucky_cards: null, rabbit_hunt: null, reveal_at_showdown: true }],
  ['gin-rummy', { ante_amount: 9, points_to_win: 50, per_point_value: 0, gin_bonus: 17, undercut_bonus: 21 }],
  ['cribbage', crib],
  ['cribbage', { ...crib, points_to_win: 121, custom_points_to_win: 121 }],
  ['cribbage', { ante_amount: 8, points_to_win: 121, game_mode: 'full', skunk_enabled: true,
    skunk_threshold: 91, double_skunk_enabled: true, double_skunk_threshold: 61 }],
];
let root: Root;
let container: HTMLDivElement;
const deadline = new Date(Date.now() + 120_000).toISOString();
const onComplete = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.mocked(configureDealerGame).mockResolvedValue({ dealer_game: { id: 'new-dealer-game' }, game: { status: 'ante_decision' }, deduped: false } as any);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function mount(gameType: string, saved: Record<string, unknown> | undefined, previousType = gameType) {
  await act(async () => root.render(<DealerGameSetup gameId="session" dealerUsername="Dealer" isBot={false}
    dealerPlayerId="dealer-player" dealerPosition={2} configDeadline={deadline} previousGameType={gameType}
    previousGameConfig={{ game_type: previousType, ante_amount: 3, run_back_config: saved } as any}
    isFirstHand={false} gameSetupTimerSeconds={120} anteDecisionTimerSeconds={30} activePlayerCount={2}
    activeHumanCount={2} onConfigComplete={onComplete} onSessionEnd={() => {}} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(60); });
}
function button() {
  const control = [...document.querySelectorAll('button')].find(node => /Run Back/.test(node.textContent ?? ''));
  expect(control).toBeTruthy(); return control!;
}
describe('the actual Run Back button across all seven games', () => {
  it.each(cases)('submits the exact %s snapshot despite conflicting form defaults: %j', async (gameType, config) => {
    await mount(gameType, config);
    await act(async () => { button().click(); button().click(); });
    expect(configureDealerGame).toHaveBeenCalledExactlyOnceWith({ gameId: 'session', dealerPlayerId: 'dealer-player',
      expectedDealerPosition: 2, expectedConfigDeadline: deadline, gameType, config });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
  it('rejects a missing snapshot or a snapshot belonging to another game', async () => {
    await mount('yahtzee', undefined); await act(async () => button().click());
    await mount('yahtzee', { ante_amount: 10 }, 'horses'); await act(async () => button().click());
    expect(configureDealerGame).not.toHaveBeenCalled();
  });
  it('allows an exact retry after a failed submission without changing settings', async () => {
    vi.mocked(configureDealerGame).mockRejectedValueOnce(new Error('temporary test failure'));
    await mount('cribbage', crib); await act(async () => button().click());
    await act(async () => button().click());
    expect(configureDealerGame).toHaveBeenCalledTimes(2);
    expect(vi.mocked(configureDealerGame).mock.calls.map(([args]) => args.config)).toEqual([crib, crib]);
  });
});
describe('saved configuration integrity', () => {
  it.each(cases)('rejects a missing required stake for %s', (gameType, config) => {
    expect(resolveExactRunBackConfig(gameType, { ...config, ante_amount: undefined })).toBeNull();
  });
  it('does not reinterpret a custom target or fill missing cribbage settings', () => {
    expect(resolveExactRunBackConfig('cribbage', { ...crib, custom_points_to_win: 121 })).toBeNull();
    expect(resolveExactRunBackConfig('cribbage', { ...crib, game_mode: undefined })).toBeNull();
  });
});
