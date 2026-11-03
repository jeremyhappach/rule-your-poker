// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const announcementMocks = vi.hoisted(() => ({
  emit: vi.fn(),
  clearAmbient: vi.fn(),
  retireTransientScope: vi.fn(),
  ambient: null as { id: string; type: string } | null,
}));

vi.mock('./CanonicalAnnouncementProvider', () => ({
  useAnnouncements: () => ({
    emit: announcementMocks.emit,
    clearAmbient: announcementMocks.clearAmbient,
    retireTransientScope: announcementMocks.retireTransientScope,
  }),
  useAnnouncementContext: () => ({ ambient: announcementMocks.ambient }),
}));

import { SessionLifecycleAnnouncer } from './SessionLifecycleAnnouncer';
import { DEFAULT_BEHAVIOR } from './types';

it('two mounted clients defer host changes until the safe phase and announce each version once', () => {
  announcementMocks.emit.mockReset();
  const props = { gameId: 'multi', gameType: 'holm', isPaused: false, sessionHostName: 'Taylor',
    configComplete: true, isViewerDealer: false, allowBotDealers: false, dealerPlayer: null,
    players: [{ id: 'a', user_id: 'a', position: 1, profiles: { username: 'Alex' } },
      { id: 'b', user_id: 'b', position: 2, profiles: { username: 'Taylor' } }],
    dealerSelectionCards: [], dealerSelectionWinnerPosition: null };
  const clients = [0, 1].map(() => render(<SessionLifecycleAnnouncer {...props} gameStatus="in_progress" sessionHostUserId="a" sessionHostVersion={0} />));
  for (const client of clients) client.rerender(<SessionLifecycleAnnouncer {...props} gameStatus="in_progress" sessionHostUserId="b" sessionHostVersion={1} />);
  expect(announcementMocks.emit.mock.calls.filter(([e]) => e.type === 'host_changed')).toHaveLength(0);
  for (const client of clients) {
    client.rerender(<SessionLifecycleAnnouncer {...props} gameStatus="waiting" sessionHostUserId="b" sessionHostVersion={1} />);
    client.rerender(<SessionLifecycleAnnouncer {...props} gameStatus="waiting" sessionHostUserId="b" sessionHostVersion={1} />);
  }
  const events = announcementMocks.emit.mock.calls.filter(([e]) => e.type === 'host_changed');
  expect(events).toHaveLength(2);
  expect(events[0][0]).toMatchObject({ id: 'multi:session-host:1', payload: { hostName: 'Taylor' } });
  clients.forEach(client => client.unmount());
});

const players = [{
  id: 'player-host',
  user_id: '11111111-1111-4111-8111-111111111111',
  position: 1,
  is_bot: false,
  sitting_out: false,
  ante_decision: 'ante_up',
  status: 'active',
  profiles: { username: 'Jeremy' },
}];

function Harness({ paused }: { paused: boolean }) {
  return (
    <SessionLifecycleAnnouncer
      gameId="game-1"
      gameType="cribbage"
      gameStatus="in_progress"
      isPaused={paused}
      sessionHostUserId="11111111-1111-4111-8111-111111111111"
      sessionHostName="Jeremy"
      configComplete
      isViewerDealer={false}
      allowBotDealers={false}
      dealerPlayer={null}
      players={players}
      dealerSelectionCards={[]}
      dealerSelectionWinnerPosition={null}
    />
  );
}

describe('SessionLifecycleAnnouncer paused ownership', () => {
  beforeEach(() => {
    announcementMocks.emit.mockReset();
    announcementMocks.clearAmbient.mockReset();
    announcementMocks.ambient = null;
  });

  it('publishes one UUID-scoped ambient for every game family, including Cribbage', async () => {
    render(<Harness paused />);

    await waitFor(() => {
      expect(announcementMocks.emit).toHaveBeenCalledWith({
        id: 'game-1:session-paused:11111111-1111-4111-8111-111111111111',
        type: 'game_paused',
        scope: { dealerGameId: 'game-1' },
        payload: { hostName: 'Jeremy' },
      });
    });
    expect(announcementMocks.emit.mock.calls[0][0].id).not.toContain('Jeremy');
    expect(DEFAULT_BEHAVIOR.game_paused).toBe('ambient');
  });

  it('retires only its paused ambient when authoritative state resumes', async () => {
    const view = render(<Harness paused />);
    await waitFor(() => expect(announcementMocks.emit).toHaveBeenCalled());

    announcementMocks.ambient = {
      id: 'game-1:session-paused:11111111-1111-4111-8111-111111111111',
      type: 'game_paused',
    };
    view.rerender(<Harness paused={false} />);

    await waitFor(() => expect(announcementMocks.clearAmbient).toHaveBeenCalledTimes(1));
  });
});
