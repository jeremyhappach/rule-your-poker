// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,render,screen,act} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {Run21ScoreCelebration} from './Run21ScoreCelebration';
import {SHELL_Z} from '@/lib/canonicalShell/zLayers';
import {platformAudio} from '@/lib/audio/platformAudio';
import {celebrationCueAt} from '@/lib/audio/celebrationCue';
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:vi.fn(()=>vi.fn())}}));
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('Run21 medal overlay',()=>{
  it.each([104,105] as const)('gives new %i the identical fanfare without shortening its medal',aggregate=>{
    vi.useFakeTimers();vi.mocked(platformAudio.follow).mockClear();
    const retired=vi.fn(),durationMs=aggregate===104?3000:3800;
    const receipt={key:'new-'+aggregate,aggregate,playerName:'You',durationMs};
    const {rerender,unmount}=render(<Run21ScoreCelebration userId="user" receipt={receipt} onRetire={retired}/>);
    expect(platformAudio.follow).toHaveBeenCalledTimes(1);
    const sound=vi.mocked(platformAudio.follow).mock.calls[0][0];
    expect(sound.expiresAt-sound.startedAt).toBe(3000);expect(sound.cueAt).toBe(celebrationCueAt);
    act(()=>vi.advanceTimersByTime(2800));expect(retired).not.toHaveBeenCalled();
    rerender(<Run21ScoreCelebration userId="user" receipt={receipt} onRetire={retired}/>);
    expect(platformAudio.follow).toHaveBeenCalledTimes(1);
    act(()=>vi.advanceTimersByTime(durationMs-2800));expect(retired).toHaveBeenCalledExactlyOnceWith(receipt.key);
    const cancel=vi.mocked(platformAudio.follow).mock.results[0].value;unmount();expect(cancel).toHaveBeenCalled();
  });
  it.each([104,105] as const)('renders and retires the %i receipt once',aggregate=>{
    vi.useFakeTimers();const retired=vi.fn();const receipt={key:'receipt',aggregate,playerName:'Opponent'};
    const {container}=render(<Run21ScoreCelebration receipt={receipt} onRetire={retired}/>);
    expect(container.childElementCount).toBe(0);const overlay=screen.getByRole('status');
    expect(overlay.style.zIndex).toBe(String(SHELL_Z.MODAL_CONTENT));expect(overlay.textContent).toContain(aggregate===105?'PERFECT 105!':'INCREDIBLE 104!');
    expect(overlay.textContent).toContain('Opponent');expect(overlay.className).toContain(aggregate===105?'gold':'silver');
    act(()=>vi.advanceTimersByTime(aggregate===105?3800:2800));expect(retired).toHaveBeenCalledExactlyOnceWith('receipt');
  });
  it('cancels a retired component timer and remains readable without animation',()=>{
    vi.useFakeTimers();const retired=vi.fn();const {unmount}=render(<Run21ScoreCelebration receipt={{key:'old',aggregate:105,playerName:'You'}} onRetire={retired}/>);
    unmount();act(()=>vi.runAllTimers());expect(retired).not.toHaveBeenCalled();
    const css=readFileSync('src/components/run21/scoreCelebration.css','utf8');expect(css).toContain('@media(prefers-reduced-motion:reduce)');expect(css).toContain('animation:none;transform:none');
  });
});
