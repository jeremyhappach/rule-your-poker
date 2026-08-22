// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { submitAnteDecisionMock } = vi.hoisted(() => ({
  submitAnteDecisionMock: vi.fn(),
}));

vi.mock('@/lib/gameTimerAuthority', () => ({
  submitAnteDecision: submitAnteDecisionMock,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

import { AnteUpDialog } from './AnteUpDialog';

const baseProps = {
  gameId: 'game-1',
  dealerGameId: 'dealer-game-1',
  playerId: 'fresh-player-1',
  gameType: 'holm-game',
  anteAmount: 2,
  legValue: 0,
  pussyTaxEnabled: true,
  pussyTaxValue: 1,
  legsToWin: 3,
  potMaxEnabled: true,
  potMaxValue: 10,
  chuckyCards: 4,
  anteDecisionDeadline: '2099-01-01T00:00:00.000Z',
};

describe('AnteUpDialog authoritative Sit Out submission', () => {
  beforeEach(() => {
    submitAnteDecisionMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each(['accepted', 'already_decided'])(
    'submits the exact admitted player and closes after Sit Out is %s',
    async (outcome) => {
    submitAnteDecisionMock.mockResolvedValue({ outcome, decision: 'sit_out' });
    const onDecisionMade = vi.fn();
    const onDecisionRejected = vi.fn();

    render(
      <AnteUpDialog
        {...baseProps}
        onDecisionMade={onDecisionMade}
        onDecisionRejected={onDecisionRejected}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sit Out/i }));

    await waitFor(() => expect(onDecisionMade).toHaveBeenCalledWith('sit_out'));
    expect(submitAnteDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-1',
      playerId: 'fresh-player-1',
      decision: 'sit_out',
    }));
    expect(onDecisionRejected).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['stale_identity', 'game changed'],
    ['deadline_expired', 'window closed'],
  ])(
    'reconciles %s and explains why the dialog remains actionable',
    async (outcome, expectedMessage) => {
    submitAnteDecisionMock.mockResolvedValue({ outcome });
    const onDecisionMade = vi.fn();
    const onDecisionRejected = vi.fn().mockResolvedValue(undefined);

    render(
      <AnteUpDialog
        {...baseProps}
        onDecisionMade={onDecisionMade}
        onDecisionRejected={onDecisionRejected}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sit Out/i }));

    await waitFor(() => expect(onDecisionRejected).toHaveBeenCalledWith(outcome, undefined));
    expect(onDecisionMade).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(expectedMessage);
    expect((screen.getByRole('button', { name: /Sit Out/i }) as HTMLButtonElement).disabled).toBe(false);
    },
  );

  it('reconciles an RPC failure and surfaces a retryable error instead of silently reopening', async () => {
    const failure = new Error('network failed');
    submitAnteDecisionMock.mockRejectedValue(failure);
    const onDecisionMade = vi.fn();
    const onDecisionRejected = vi.fn().mockResolvedValue(undefined);

    render(
      <AnteUpDialog
        {...baseProps}
        onDecisionMade={onDecisionMade}
        onDecisionRejected={onDecisionRejected}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sit Out/i }));

    await waitFor(() => expect(onDecisionRejected).toHaveBeenCalledWith('rpc_error', failure));
    expect(onDecisionMade).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('could not be submitted');
  });
});
