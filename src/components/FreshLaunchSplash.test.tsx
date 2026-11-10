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
let videoReady = 2;
beforeEach(() => {
  vi.useFakeTimers();
  mock.lease = null; videoReady=2; reduced = false; imageError = false; imageStalled = false;
  launchSplash.eligible = true; launchSplash.consumed = false;
  // Arrival after a slow boot must not disqualify this fresh document.
  vi.spyOn(performance, 'now').mockReturnValue(12000);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Image', class {
    onload?: () => void; onerror?: () => void;
    set src(_: string) { if (!imageStalled) queueMicrotask(() => imageError ? this.onerror?.() : this.onload?.()); }
  });
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(()=>videoReady);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tree = (ready = true, path = '/', userId = 'user') => <MemoryRouter initialEntries={[path]}><FreshLaunchSplash userId={userId} ready={ready} /><button>Real lobby</button></MemoryRouter>;
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const splash = () => document.querySelector('[data-launch-splash]');

it('plays the same approved splash over login after an eligible signed-out home entry', async () => {
  render(<MemoryRouter initialEntries={['/auth']}><FreshLaunchSplash userId={null} destination="auth" ready /><button>Login</button></MemoryRouter>);
  await flush();
  expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
  expect(document.querySelector('button')?.textContent).toBe('Login');
  const video=document.querySelector('video')!;
  expect(video.currentTime).toBe(0);expect(video.playsInline).toBe(true);
  fireEvent.ended(video);await flush(200);expect(splash()).toBeNull();
  expect(document.querySelector('button')?.textContent).toBe('Login');
});

it.each(['/auth?reset=true','/auth#recovery','/delayed/match'])('does not cover an auth recovery or deep-link destination: %s', async path => {
  render(<MemoryRouter initialEntries={[path]}><FreshLaunchSplash userId={null} destination="auth" ready /></MemoryRouter>);
  await flush();expect(splash()).toBeNull();expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it('does not animate an ordinary direct login or replay on a login remount', async () => {
  const login=<MemoryRouter initialEntries={['/auth']}><FreshLaunchSplash userId={null} destination="auth" ready /></MemoryRouter>;
  launchSplash.eligible=false;const direct=render(login);await flush();expect(splash()).toBeNull();direct.unmount();
  launchSplash.eligible=true;const home=render(login);await flush();expect(splash()).not.toBeNull();home.unmount();
  render(login);await flush();expect(splash()).toBeNull();
});

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
  await act(async () => pending.get(SPLASH_OPENING_FRAME)?.onload?.());
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

it('requests playback before data arrives, keeps the opening covered and plays the full clip once loaded', async()=>{
 videoReady=0;render(tree());await flush();
 expect(splash()?.getAttribute('data-launch-splash')).toBe('preparing');
 expect(splash()?.getAttribute('data-frame-ready')).toBe('false');
 expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
 await flush(2000);const video=document.querySelector('video')!;videoReady=2;fireEvent.loadedData(video);await flush();
 expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
 expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
 expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
 expect(video.getAttribute('src')).toBe('/launch-splash/approved-v1.mp4');
 expect(splash()?.getAttribute('data-frame-ready')).toBe('false');
 fireEvent.playing(video);await flush(40);expect(splash()?.getAttribute('data-frame-ready')).toBe('true');
 await flush(2900);expect(document.querySelector('video')).not.toBeNull();
 fireEvent.ended(video);expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_POSTER);
});
it('does not expose a downloaded image before decode finishes',async()=>{
 const decoded:Array<()=>void>=[];vi.stubGlobal('Image',class{onload?:()=>void;decode(){return new Promise<void>(resolve=>{decoded.push(resolve);});}set src(_:string){queueMicrotask(()=>this.onload?.());}});
 render(tree());await flush();expect(splash()).toBeNull();
 await act(async()=>decoded[0]());expect(splash()).toBeNull();
 await act(async()=>decoded[1]());expect(splash()?.getAttribute('data-launch-splash')).toBe('showing');
});

it.each(['rejected', 'stalled'])('bounds a cold playback request when %s', async mode => {
  videoReady = 0;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => mode === 'rejected'
    ? Promise.reject(new Error('NotAllowedError')) : new Promise(() => {}));
  render(tree()); await flush();
  if (mode === 'stalled') await flush(5000);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  expect(document.querySelector('img')?.getAttribute('src')).toBe(SPLASH_POSTER);
  expect(splash()?.getAttribute('data-launch-splash')).toBe('fading');
  await flush(200); expect(splash()).toBeNull();
});

it('cancels pending cold playback on resume and ignores its late rejection', async () => {
  videoReady = 0;
  let reject!: (reason: Error) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  render(tree()); await flush();
  act(() => window.dispatchEvent(new Event('app:page-resumed')));
  expect(splash()).toBeNull();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  await act(async () => reject(new Error('AbortError')));
  await flush(6000); expect(splash()).toBeNull();
});
