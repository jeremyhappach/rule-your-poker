// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mock = vi.hoisted(() => ({ response: { data: [] as unknown[] | null, error: null as unknown }, calls: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  mock.calls++;
  const chain = { select: () => chain, eq: () => chain, neq: () => chain, limit: () => chain,
    abortSignal: () => Promise.resolve(mock.response) };
  return chain;
} } }));
import { launchSplash } from '@/lib/launchSplash';
import { FreshLaunchSplash } from './FreshLaunchSplash';

let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  mock.response = { data: [], error: null }; mock.calls = 0; reduced = false;
  launchSplash.eligible = true; launchSplash.consumed = false;
  vi.spyOn(performance, 'now').mockReturnValue(500);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Image', class { onload?: () => void; onerror?: () => void; set src(_: string) { queueMicrotask(() => this.onload?.()); } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (ready = true, path = '/') => render(<MemoryRouter initialEntries={[path]}><FreshLaunchSplash userId="user" ready={ready} /><button>Real lobby</button></MemoryRouter>);
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };
const splash = () => document.querySelector('[data-launch-splash]');

it('keeps the real lobby mounted, bounds stalled playback and cleans media', async () => {
  mount(); await flush();
  expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
  expect(document.querySelector('button')?.textContent).toBe('Real lobby');
  expect(document.querySelector('video')?.muted).toBe(true);
  expect(document.querySelector('video')?.playsInline).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(splash()?.getAttribute('data-launch-splash')).toBe('fading');
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(splash()).toBeNull();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
it.each([{ data: [{ id: 'active-seat' }], error: null }, { data: null, error: new Error('offline') }])('never covers active/unknown membership', async response => {
  mock.response = response; mount(); await flush(); expect(splash()).toBeNull();
});
it('never starts before actual lobby data is ready', async () => {
  mount(false); await flush(); expect(splash()).toBeNull(); expect(launchSplash.consumed).toBe(false);
});
it('does no membership read for an excluded launch', async () => {
  launchSplash.eligible = false; mount(); await flush(); expect(mock.calls).toBe(0); expect(splash()).toBeNull();
});
it('does not restart on remount/internal return', async () => {
  const first = mount(); await flush(); expect(splash()).not.toBeNull(); first.unmount();
  mount(); await flush(); expect(splash()).toBeNull();
});
it.each(['reduced', 'rejected', 'unsupported'])('falls back without a playback wait: %s', async mode => {
  reduced = mode === 'reduced';
  if (mode === 'rejected') vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('NotAllowedError'));
  if (mode === 'unsupported') vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('');
  mount(); await flush();
  expect(document.querySelector('video')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(splash()).toBeNull();
});
it('immediately dismisses on resume or keyboard interaction', async () => {
  mount(); await flush();
  act(() => window.dispatchEvent(new Event('app:page-resumed')));
  expect(splash()).toBeNull();
});
