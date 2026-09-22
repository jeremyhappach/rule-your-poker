// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';
import { renderAnnouncement } from '@/lib/canonicalShell/announcements/renderers';
import { FarkleGameTable } from './FarkleGameTable';

const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('@/lib/canonicalShell/announcements', () => ({ useAnnouncements: () => ({ emit }) }));
vi.mock('@/lib/canonicalShell/ShellOwnedFeltHost', () => ({ usePublishShellFelt: vi.fn() }));
vi.mock('@/lib/canonicalShell/ShellTabBar', () => ({ useShellTabBar: vi.fn() }));
vi.mock('@/lib/canonicalShell/ShellHudGrid', () => ({ ShellHudGrid: () => null }));
vi.mock('@/lib/canonicalShell/GameplayOpponentSeatLayer', () => ({ GameplayOpponentSeatLayer: () => null }));
vi.mock('@/lib/farkle/FarkleGameplayGeometryProvider', () => ({ FarkleGameplayGeometryProvider: () => null }));
vi.mock('@/hooks/GameChatContext', () => ({ useGameChatContext: () => ({}) }));
vi.mock('@/lib/sessionPlayerIntent', () => ({ setAutomaticPlay: vi.fn() }));
vi.mock('@/lib/farkle/authority', () => ({
  readFarkleReplay: vi.fn().mockResolvedValue(null), applyFarkleAction: vi.fn(), createFarkleActionRequest: vi.fn(),
}));
vi.mock('./FarkleTerminalPresentation', () => ({ FarkleTerminalPresentation: () => null }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: () => null, DialogContent: () => null, DialogHeader: () => null, DialogTitle: () => null,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Farkle canonical notices', () => {
  it.each([['hot_dice', 'HOT DICE'], ['farkle', 'FARKLE'], ['dice_held', 'THIS TURN +250'], ['banked', 'Player BANKS 250']])('renders %s through the existing canonical renderer', async (type, title) => {
    const state = farkleTestState();
    const scope = { gameId: 'session', dealerGameId: 'dealer', handNumber: 1, roundId: state._authorityScope };
    const props = { scope, incoming: state, revision: 1, players: [], isPaused: false, isRealMoney: false, onRefetch: vi.fn() };
    const view = render(<FarkleGameTable {...props} />);
    expect(emit).not.toHaveBeenCalled();
    const incoming = { ...state, actionSequence: 2, events: [{ type, points: 250, indexes: [0] }] };
    view.rerender(<FarkleGameTable {...props} incoming={incoming} revision={2} />);
    await waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    const event = emit.mock.calls[0][0];
    expect(event).toMatchObject({ type: 'gameplay_notice', payload: { title }, ttlMs: type === 'dice_held' ? 900 : 1600, behavior: 'enqueue',
      scope: { dealerGameId: scope.gameId, roundId: scope.roundId } });
    render(renderAnnouncement(event));
    expect(screen.getByText(title)).toBeVisible();
    view.rerender(<FarkleGameTable {...props} incoming={structuredClone(incoming)} revision={2} />);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
