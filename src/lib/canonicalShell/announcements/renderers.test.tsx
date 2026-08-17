// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/LifecycleAnnouncement', () => ({
  LifecycleAnnouncement: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <div>{title}</div>
      {subtitle ? <div>{subtitle}</div> : null}
    </div>
  ),
}));

import { renderAnnouncement } from './renderers';

describe('solo showdown announcement', () => {
  it('keeps the hand call alongside its persistent pot context', () => {
    render(renderAnnouncement({
      id: 'solo-showdown:hand-1',
      type: 'solo_showdown',
      scope: { dealerGameId: 'game-1', roundId: 'hand-1' },
      payload: {
        potText: 'Pot: $6',
        text: 'Hap has a pair of 8s',
      },
      behavior: 'ambient',
    }));

    expect(screen.getByText('Pot: $6')).not.toBeNull();
    expect(screen.getByText('Hap has a pair of 8s')).not.toBeNull();
  });
});

describe('paused-game announcement', () => {
  it('renders the persistent host-only resume instruction verbatim', () => {
    render(renderAnnouncement({
      id: 'game-1:session-paused:host-user-id',
      type: 'game_paused',
      scope: { dealerGameId: 'game-1' },
      payload: { hostName: 'Jeremy' },
      behavior: 'ambient',
    }));

    expect(screen.getByText('Game is paused - only Jeremy can resume')).not.toBeNull();
  });
});

describe('generic gameplay announcement', () => {
  it('renders non-blocking game narration in the canonical rail', () => {
    render(renderAnnouncement({
      id: 'yahtzee-score:round-1:8',
      type: 'gameplay_notice',
      scope: { dealerGameId: 'game-1', roundId: 'round-1' },
      payload: { title: 'Hap scored 3 x 6s' },
      ttlMs: 2500,
    }));

    expect(screen.getByText('Hap scored 3 x 6s')).not.toBeNull();
  });
});
