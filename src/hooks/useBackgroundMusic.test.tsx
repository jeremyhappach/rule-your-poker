// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBackgroundMusic } from './useBackgroundMusic';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps music on its existing HTML audio controls, volume, pause and cleanup path', async () => {
  const media = { src: '', volume: 0, currentTime: 0, addEventListener: vi.fn(), play: vi.fn(async () => {}), pause: vi.fn() };
  const webAudio = vi.fn(); vi.stubGlobal('AudioContext', webAudio);
  vi.stubGlobal('Audio', class { constructor() { return media; } });
  const hook = renderHook(() => useBackgroundMusic());
  await act(async () => hook.result.current.togglePlay());
  expect(media.volume).toBe(0.3); expect(media.src).toMatch(/^\/music\/bluegrass-[1-5]\.mp3$/);
  expect(media.play).toHaveBeenCalledTimes(1); expect(hook.result.current.isPlaying).toBe(true);
  await act(async () => hook.result.current.togglePlay()); expect(media.pause).toHaveBeenCalledTimes(1);
  hook.unmount(); expect(media.pause).toHaveBeenCalledTimes(2); expect(webAudio).not.toHaveBeenCalled();
});
