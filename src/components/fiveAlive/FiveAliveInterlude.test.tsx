// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {FiveAliveFailure} from './FiveAliveInterlude';
const audio=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:audio}}));
afterEach(()=>{cleanup();vi.useRealTimers();audio.mockReset();});
it('requests the shared muted audio path once and holds failure and answer for five seconds',()=>{
 vi.useFakeTimers();const done=vi.fn(),ui=render(<FiveAliveFailure identity="word:2" answer="WATER" userId="me" onDone={done}/>);
 expect(screen.getByText('You failed!')).toBeTruthy();expect(screen.getByText('WATER')).toBeTruthy();expect(audio).toHaveBeenCalledTimes(1);
 act(()=>vi.advanceTimersByTime(4999));expect(done).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));expect(done).toHaveBeenCalledTimes(1);ui.unmount();act(()=>vi.advanceTimersByTime(5000));expect(done).toHaveBeenCalledTimes(1);
});
