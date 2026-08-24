// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isRenderedActionSurfaceVisible,
  requestActionSurfaceRecovery,
  subscribeActionSurfaceRecoveryRequests,
} from './actionSurfaceRecovery';

describe('authoritative action-surface recovery', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('requests one parent-owned snapshot and returns its result', async () => {
    const unsubscribe = subscribeActionSurfaceRecoveryRequests((request) => {
      request.handled = true;
      request.respond(true);
    });
    await expect(requestActionSurfaceRecovery({
      gameId: 'game-1',
      gameType: '3-5-7',
      identityKey: 'round-1:player-1',
      surface: 'holm-357-decision',
    })).resolves.toBe(true);
    unsubscribe();
  });

  it('fails closed when no parent recovery owner is mounted', async () => {
    await expect(requestActionSurfaceRecovery({
      gameId: 'game-1',
      gameType: 'yahtzee',
      identityKey: 'round-1:player-1',
      surface: 'yahtzee-turn',
    })).resolves.toBe(false);
  });

  it('requires non-zero, rendered geometry', () => {
    const element = document.createElement('button');
    document.body.append(element);
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40,
      width: 100, height: 40, toJSON: () => ({}),
    });
    expect(isRenderedActionSurfaceVisible(element)).toBe(true);
    element.style.display = 'none';
    expect(isRenderedActionSurfaceVisible(element)).toBe(false);
  });
});
