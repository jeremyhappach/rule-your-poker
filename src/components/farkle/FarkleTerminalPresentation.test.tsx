// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FarkleTerminalPresentation } from './FarkleTerminalPresentation';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';

const mocks = vi.hoisted(() => ({ admission: null as any, settled: null as any, started: null as any, emit: vi.fn(), confetti: vi.fn() }));
vi.mock('@/lib/canonicalShell/ChipTransportProvider', () => ({ useChipTransferPresentationAdmission: (admit: any, settled: any, started: any) => {
  mocks.admission = admit; mocks.settled = settled; mocks.started = started;
} }));
vi.mock('@/lib/canonicalShell/announcements', () => ({ useAnnouncements: () => ({ emit: mocks.emit }) }));
vi.mock('canvas-confetti', () => ({ default: mocks.confetti }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Farkle terminal completion from canonical ledger', () => {
  it('waits for exact payout completion and never retires from a timer or stale batch', () => {
    const scope = { gameId: 'game', dealerGameId: 'dealer', roundId: 'round', handNumber: 1 };
    const state = { ...farkleTestState(), _authorityScope: 'round', gamePhase: 'complete' as const,
      winnerPlayerId: 'winner', turnOrder: ['winner', 'loser'] };
    const batch = { game_id: 'game', dealer_game_id: 'dealer', reason: 'transfer', transfers: [{ id: 'x',
      amount: state.config.ante_amount, from: { kind: 'player', playerId: 'loser' }, to: { kind: 'player', playerId: 'winner' } }] };
    const onActive = vi.fn(), onComplete = vi.fn();
    const view = render(<FarkleTerminalPresentation scope={scope} state={state} live={false} winnerName="Winner" winnerIsSelf onActive={onActive} onComplete={onComplete} />);
    expect(mocks.admission(batch)).toBe(false);
    expect(onActive).not.toHaveBeenCalled();
    view.rerender(<FarkleTerminalPresentation scope={scope} state={state} live winnerName="Winner" winnerIsSelf onActive={onActive} onComplete={onComplete} />);
    expect(onActive).toHaveBeenCalledWith(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.admission(batch)).toBe(true);
    act(() => { mocks.settled({ ...batch, dealer_game_id: 'old' }); });
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { mocks.started(batch); mocks.started(batch); });
    expect(mocks.emit).toHaveBeenCalledTimes(1);
    expect(mocks.emit.mock.calls[0][0].scope.dealerGameId).toBe(scope.gameId);
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
    act(() => { mocks.settled(batch); mocks.settled(batch); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('farkle|winseq|game|dealer|1|winner|round');
    expect(onActive).toHaveBeenLastCalledWith(false);
  });
});
