// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const triAccess = vi.hoisted(() => ({allowed:false}));
const raceAccess = vi.hoisted(() => ({allowed:false}));
const canastaAccess = vi.hoisted(() => ({allowed:false}));
vi.mock('@/hooks/useCanastaAccess',()=>({useCanastaAccess:()=>canastaAccess.allowed}));
vi.mock('@/hooks/useRacePokerAccess',()=>({useRacePokerAccess:()=>raceAccess.allowed}));
vi.mock('@/hooks/useTriTowersTestAccess',()=>({useTriTowersTestAccess:()=>triAccess.allowed}));
vi.mock('@/lib/canonicalShell/lifecycleDebug', () => ({ useLifecycleMount: vi.fn() }));
vi.mock('@/lib/canonicalShell/waitingTableFlight', () => ({ useWaitingMount: vi.fn(), recordSurfaceOwnership: vi.fn(), recordWaitingLifecycle: vi.fn() }));
vi.mock('@/lib/debugHarness/activeHarnessWarning', () => ({ useActiveHarnessMap: () => ({}), useActiveHarnessInfo: () => ({ active: false }) }));
vi.mock('@/lib/persistSyncDebugEvent', () => ({ persistSyncDebugEvent: vi.fn() }));
vi.mock('@/lib/startupFlightRecorder', () => ({ recordStartupFlight: vi.fn(), resetStartupFlight: vi.fn() }));
vi.mock('@/lib/dealerGameSetupAuthority', () => ({ configureDealerGame: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
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
import { toast } from 'sonner';
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
  vi.useFakeTimers(); vi.clearAllMocks(); triAccess.allowed=false; raceAccess.allowed=false; canastaAccess.allowed=false;
  vi.mocked(configureDealerGame).mockResolvedValue({ dealer_game: { id: 'new-dealer-game' }, game: { status: 'ante_decision' }, deduped: false } as any);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function mount(gameType: string, saved: Record<string, unknown> | undefined, previousType = gameType, counts = {players: 2, humans: 2}, realMoney = false) {
  await act(async () => root.render(<DealerGameSetup gameId="session" dealerUsername="Dealer" isBot={false}
    dealerPlayerId="dealer-player" dealerPosition={2} configDeadline={deadline} previousGameType={gameType}
    previousGameConfig={{ game_type: previousType, ante_amount: 3, run_back_config: saved } as any}
    isFirstHand={false} gameSetupTimerSeconds={120} anteDecisionTimerSeconds={30} activePlayerCount={counts.players}
    activeHumanCount={counts.humans} realMoney={realMoney} onConfigComplete={onComplete} onSessionEnd={() => {}} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(60); });
}
function button() {
  const control = [...document.querySelectorAll('button')].find(node => /Run Back/.test(node.textContent ?? ''));
  expect(control).toBeTruthy(); return control!;
}
describe('the actual Run Back button across all seven games', () => {
  it('keeps Canasta setup and Run Back hidden when admission is closed',async()=>{
    await mount('canasta',{ante_amount:9});
    expect(document.querySelector('[data-dealer-game-option="canasta"]')).toBeNull();
    expect([...document.querySelectorAll('button')].some(node=>/Run Back/.test(node.textContent??''))).toBe(false);
  });
  it.each([1,2])('submits the exact Canasta match stake with %i humans',async humans=>{
    const config={ante_amount:9,runBackDealerGameId:'10000000-0000-4000-8000-000000000001'};
    canastaAccess.allowed=true;await mount('canasta',config,'canasta',{players:2,humans});
    await act(async()=>{button().click();button().click();});
    expect(configureDealerGame).toHaveBeenCalledExactlyOnceWith({gameId:'session',dealerPlayerId:'dealer-player',expectedDealerPosition:2,expectedConfigDeadline:deadline,gameType:'canasta',config});
  });
  it('blocks Canasta Run Back in real money even with a stale positive capability',async()=>{
    canastaAccess.allowed=true;await mount('canasta',{ante_amount:9},'canasta',{players:2,humans:2},true);
    expect(button().disabled).toBe(true);await act(async()=>button().click());expect(configureDealerGame).not.toHaveBeenCalled();
  });
  it('keeps Race Poker Run Back hidden while capability is closed',async()=>{
    await mount('race-poker',{ante_amount:9});
    expect(document.querySelector('[data-dealer-game-option="race-poker"]')).toBeNull();
    expect([...document.querySelectorAll('button')].some(node=>/Run Back/.test(node.textContent??''))).toBe(false);
    expect(configureDealerGame).not.toHaveBeenCalled();
  });
  it('submits exact Race Poker Run Back stake for one human and one bot',async()=>{
    raceAccess.allowed=true;await mount('race-poker',{ante_amount:9},'race-poker',{players:2,humans:1});
    await act(async()=>{button().click();button().click();});
    expect(configureDealerGame).toHaveBeenCalledExactlyOnceWith({gameId:'session',dealerPlayerId:'dealer-player',expectedDealerPosition:2,expectedConfigDeadline:deadline,gameType:'race-poker',config:{ante_amount:9}});
  });
  it.each([{players:1,humans:1},{players:3,humans:2},{players:2,humans:0}])('blocks Race Poker Run Back for invalid roster %j',async counts=>{
    raceAccess.allowed=true;await mount('race-poker',{ante_amount:9},'race-poker',counts);
    expect(button().disabled).toBe(true);await act(async()=>button().click());expect(configureDealerGame).not.toHaveBeenCalled();
  });
  it('explains server admission denial from a previously loaded Run Back', async () => {
    triAccess.allowed=true;
    vi.mocked(configureDealerGame).mockRejectedValueOnce({message:'tri_towers:admission_closed'});
    await mount('tri-towers', {ante_amount:5});
    await act(async () => button().click());
    expect(toast.error).toHaveBeenCalledWith('New TriTowers games are temporarily unavailable. Choose another game.');
    expect(onComplete).not.toHaveBeenCalled();
  });
  it('never exposes TriTowers or its Run Back before activation', async () => {
    await mount('tri-towers', { ante_amount: 5 });
    expect(document.querySelector('[data-dealer-game-option="tri-towers"]')).toBeNull();
    expect([...document.querySelectorAll('button')].some(node=>/Run Back/.test(node.textContent??''))).toBe(false);
    expect(configureDealerGame).not.toHaveBeenCalled();
  });
  it('starts an authorized TriTowers Run Back through the setup authority', async () => {
    triAccess.allowed=true;
    await mount('tri-towers', {ante_amount:5});
    await act(async () => button().click());
    expect(configureDealerGame).toHaveBeenCalledExactlyOnceWith({gameId:'session',dealerPlayerId:'dealer-player',expectedDealerPosition:2,expectedConfigDeadline:deadline,gameType:'tri-towers',config:{ante_amount:5}});
  });
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
describe('Cribbage configuration rejection messages', () => {
  it.each([
    ['Supabase object', { code: '55000', message: 'real_money_liveness_unavailable:session_recovery_failure' }, true],
    ['Error instance', new Error('real_money_liveness_unavailable:scheduler_heartbeat_stale'), true],
    ['unrelated server error', { code: 'P0001', message: 'configure_dealer_game:configuration_expired' }, false],
    ['malformed error', { message: 55000 }, false],
    ['null error', null, false],
  ])('preserves the intended message for %s', async (_label, error, recoveryBlocked) => {
    vi.mocked(configureDealerGame).mockRejectedValueOnce(error);
    await mount('cribbage', undefined);
    const option = document.querySelector<HTMLButtonElement>('[data-dealer-game-option="cribbage"]');
    expect(option).toBeTruthy();
    await act(async () => option!.click());
    const start = document.querySelector<HTMLButtonElement>('[data-dealer-game-start="cribbage"]');
    expect(start).toBeTruthy();
    await act(async () => start!.click());
    expect(configureDealerGame).toHaveBeenCalledOnce();
    expect(vi.mocked(configureDealerGame).mock.calls[0][0].gameType).toBe('cribbage');
    expect(onComplete).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenLastCalledWith(recoveryBlocked
      ? 'Real-money deal blocked because server recovery is not healthy. No ante or game state was committed. Try again shortly.'
      : 'Could not configure the game');
    expect(start!.disabled).toBe(false);
  });
});

describe('TriTowers setup validation messages', () => {
  const humanRequired = 'TriTowers needs at least one eligible human player.';
  async function openSetup(counts = {players: 2, humans: 2}) {
    triAccess.allowed = true;
    await mount('tri-towers', {ante_amount: 5}, 'tri-towers', counts);
    const option = document.querySelector<HTMLButtonElement>('[data-dealer-game-option="tri-towers"]');
    expect(option).toBeTruthy();
    await act(async () => option!.click());
    return document.querySelector<HTMLButtonElement>('[data-dealer-game-start="tri-towers"]')!;
  }

  it.each([
    ['Supabase plain object', {code: 'P0001', message: 'tri_towers:human_required', details: null, hint: null}],
    ['Error instance', new Error('tri_towers:human_required')],
  ])('shows the human-required guidance for a %s and permits a corrected retry', async (_label, error) => {
    // The UI can be stale when the human roster changes; the authoritative RPC still decides.
    vi.mocked(configureDealerGame).mockRejectedValueOnce(error);
    const start = await openSetup();
    await act(async () => start.click());
    expect(toast.error).toHaveBeenLastCalledWith(humanRequired);
    expect(onComplete).not.toHaveBeenCalled();
    expect(start.disabled).toBe(false);
    await act(async () => start.click());
    expect(configureDealerGame).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('uses the same actionable error for Run Back', async () => {
    triAccess.allowed = true;
    vi.mocked(configureDealerGame).mockRejectedValueOnce({message: 'tri_towers:human_required'});
    await mount('tri-towers', {ante_amount: 5});
    await act(async () => button().click());
    expect(toast.error).toHaveBeenLastCalledWith(humanRequired);
    expect(onComplete).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it.each([
    ['player_count', 'Have 2–7 players, including at least one human, take active seats before starting TriTowers.'],
    ['real_money_closed', 'TriTowers currently supports fake-money sessions only. Create a session with Real Money turned off.'],
    ['tester_required', 'Every human in the session needs an active approved account for TriTowers. Ask the host to check player access.'],
    ['release_closed', 'TriTowers is currently unavailable. Ask the host to check game access before trying again.'],
    ['dealer_required', 'Only the current human dealer can start TriTowers.'],
    ['config', 'Use a whole-number stake from 1 to 9,999. If setup has expired, return to the current dealer setup.'],
    ['setup_identity', 'The dealer or setup window has changed, or the session is paused or ending. Return to the current session setup before trying again.'],
    ['setup_replay_conflict', 'This setup was already submitted with different settings. Return to the session to see the current game.'],
    ['setup_retired', 'This setup is no longer current. Return to the session to continue.'],
    ['unfinished_pot', "The previous game's pot has not been settled. Finish that game before starting TriTowers."],
    ['unknown_failure', 'Could not configure the game'],
  ])('explains %s from a Supabase plain-object rejection', async (code, message) => {
    vi.mocked(configureDealerGame).mockRejectedValueOnce({code: 'P0001', message: 'tri_towers:' + code});
    const start = await openSetup();
    await act(async () => start.click());
    expect(toast.error).toHaveBeenLastCalledWith(message);
    expect(configureDealerGame).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('accepts mixed participants without a bot restriction warning', async () => {
    triAccess.allowed = true;
    await mount('tri-towers', {ante_amount: 5}, 'tri-towers', {players: 3, humans: 2});
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('[data-dealer-game-option="tri-towers"]')!.click());
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(configureDealerGame).not.toHaveBeenCalled();
    await mount('tri-towers', {ante_amount: 5});
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not warn or alter setup for another game with active bots', async () => {
    await mount('cribbage', crib, 'cribbage', {players: 3, humans: 2});
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await act(async () => button().click());
    expect(configureDealerGame).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
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
