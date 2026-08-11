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
