// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mock = vi.hoisted(() => ({ lease: null as unknown }));
vi.mock('@/lib/sessionRecoveryLease', () => ({ getActiveRecoveryLease: () => mock.lease }));
import { launchSplash, SPLASH_OPENING_FRAME, SPLASH_POSTER } from '@/lib/launchSplash';
import { FreshLaunchSplash } from './FreshLaunchSplash';

let reduced = false, imageError = false, imageStalled = false;
beforeEach(() => {
  vi.useFakeTimers();
  mock.lease = null; reduced = false; imageError = false; imageStalled = false;
  launchSplash.eligible = true; launchSplash.consumed = false;
  // Arrival after a slow boot must not disqualify this fresh document.
  vi.spyOn(performance, 'now').mockReturnValue(12000);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Image', class {
    onload?: () => void; onerror?: () => void;
    set src(_: string) { if (!imageStalled) queueMicrotask(() => imageError ? this.onerror?.() : this.onload?.()); }
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tree = (ready = true, path = '/', userId = 'user') => <MemoryRouter initialEntries={[path]}><FreshLaunchSplash userId={userId} ready={ready} /><button>Real lobby</button></MemoryRouter>;
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const splash = () => document.querySelector('[data-launch-splash]');

it('shows after a slow boot, keeps lobby mounted, starts at frame zero and fades on ended', async () => {
  render(tree()); await flush();
  expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
  expect(document.querySelector('button')?.textContent).toBe('Real lobby');
  const video = document.querySelector('video')!;
  expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_OPENING_FRAME);
  expect(video.getAttribute('poster')).toBe(SPLASH_OPENING_FRAME);
  expect(video.muted).toBe(true); expect(video.playsInline).toBe(true); expect(video.currentTime).toBe(0);
  fireEvent.ended(video);
  expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_POSTER);
  expect(splash()?.getAttribute('data-launch-splash')).toBe('fading');
  await flush(200); expect(splash()).toBeNull();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
it('plays while lobby data loads past two seconds, holds final PNG and releases when ready', async () => {
  const view = render(tree(false)); await flush();
  expect(splash()).not.toBeNull();
  await flush(2500); expect(document.querySelector('video')).not.toBeNull();
  fireEvent.ended(document.querySelector('video')!);
  expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
  expect(document.querySelector('video')).toBeNull();
  expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_POSTER);
  await flush(1000);
  view.rerender(tree(true));
  expect(splash()?.getAttribute('data-launch-splash')).toBe('fading');
  await flush(200); expect(splash()).toBeNull();
});
it('releases failed initialization within five seconds plus fade', async () => {
  render(tree(false)); await flush();
  await flush(5000); expect(splash()?.getAttribute('data-launch-splash')).toBe('fading');
  await flush(200); expect(splash()).toBeNull();
  expect(document.querySelector('button')?.textContent).toBe('Real lobby');
});
it('waits for the opening image even when the completed PNG is already loaded', async () => {
  const pending = new Map<string, { onload?: () => void }>();
  vi.stubGlobal('Image', class {
    onload?: () => void;
    set src(value: string) { pending.set(value, this); }
  });
  render(tree());
  act(() => pending.get(SPLASH_POSTER)?.onload?.());
  expect(splash()).toBeNull();
  act(() => pending.get(SPLASH_OPENING_FRAME)?.onload?.());
  expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
  expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_OPENING_FRAME);
});
it('bounds stalled playback without waiting for ended', async () => {
  render(tree()); await flush(); await flush(3500);
  expect(splash()?.getAttribute('data-launch-splash')).toBe('fading');
  await flush(200); expect(splash()).toBeNull();
});
it('excludes actual recovery even on the root route', async () => {
  mock.lease = { gameId: 'current-table' };
  render(tree()); await flush(); expect(splash()).toBeNull();
});
it('excludes a launch captured on a different route', async () => {
  launchSplash.eligible = false; render(tree()); await flush(); expect(splash()).toBeNull();
});
it('does not restart on remount/internal return', async () => {
  const first = render(tree()); await flush(); expect(splash()).not.toBeNull(); first.unmount();
  render(tree()); await flush(); expect(splash()).toBeNull();
});
it('survives StrictMode setup/cleanup replay without a second launch', async () => {
  render(<React.StrictMode>{tree()}</React.StrictMode>); await flush();
  expect(splash()).not.toBeNull(); expect(launchSplash.consumed).toBe(true);
});
it.each(['reduced', 'rejected', 'unsupported'])('falls back without forcing a playback wait: %s', async mode => {
  reduced = mode === 'reduced';
  if (mode === 'rejected') vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('NotAllowedError'));
  if (mode === 'unsupported') vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('');
  render(tree()); await flush(); expect(document.querySelector('video')).toBeNull();
  expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_POSTER);
  await flush(200); expect(splash()).toBeNull();
});
it.each(['app:page-resumed', 'pagehide', 'popstate', 'keydown', 'pointerdown'])('dismisses immediately on %s', async event => {
  render(tree()); await flush(); act(() => window.dispatchEvent(new Event(event))); expect(splash()).toBeNull();
});
it('cancels before a delayed poster can introduce a splash on resume', async () => {
  imageStalled = true; render(tree()); await flush();
  act(() => window.dispatchEvent(new Event('app:page-resumed')));
  await flush(6000); expect(splash()).toBeNull();
});
it.each(['failed', 'stalled'])('never covers the lobby with a missing poster: %s', async kind => {
  imageError = kind === 'failed'; imageStalled = kind === 'stalled';
  render(tree()); await flush(6000); expect(splash()).toBeNull();
});
it('never carries the splash across account identity', async () => {
  const view = render(tree()); await flush();
  view.rerender(tree(true, '/', 'other-user')); expect(splash()).toBeNull();
});
