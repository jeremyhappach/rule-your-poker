// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderCelebration } from './celebrationRenderers';
import type { AnnouncementEvent } from './types';

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function matchWin(payload: AnnouncementEvent['payload']): AnnouncementEvent {
  return {
    id: 'test-match-win',
    type: 'match_win',
    scope: { dealerGameId: 'g1', roundId: null },
    payload,
  };
}

describe('renderCelebration', () => {
  it('restores the legacy full-overlay skunk treatment for skunk wins', () => {
    act(() => {
      root.render(renderCelebration(matchWin({ skunk: 'single' })));
    });

    expect(container.textContent).toContain('🦨');
    expect(container.textContent).toContain('SKUNK!');
    expect(container.textContent).toContain('2x Payout!');
    expect(container.querySelector('.absolute.inset-0')).toBeTruthy();
  });

  it('restores the legacy double-skunk treatment with two skunks and 3x payout', () => {
    act(() => {
      root.render(renderCelebration(matchWin({ skunk: 'double' })));
    });

    expect(container.textContent).toContain('DOUBLE SKUNK!');
    expect(container.textContent).toContain('3x Payout!');
    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(2);
  });

  it('does not invent a match-win card for non-skunk wins', () => {
    act(() => {
      root.render(renderCelebration(matchWin({ winnerName: 'Host', amount: 20 })));
    });

    expect(container.textContent).toBe('');
    expect(container.querySelector('.absolute.inset-0')).toBeNull();
  });
});