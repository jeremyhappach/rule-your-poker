// @vitest-environment jsdom
import {createRef} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {FiveAliveAward} from './FiveAliveAward';
const {scoreAudio}=vi.hoisted(()=>({scoreAudio:vi.fn()}));
vi.mock('@/hooks/usePresentedScoreAudio',()=>({usePresentedScoreAudio:scoreAudio}));
afterEach(()=>{cleanup();vi.restoreAllMocks();scoreAudio.mockClear();});

it('counts a solved award in presentation and retires it without changing game state',()=>{
 let next:FrameRequestCallback=()=>{};
 vi.spyOn(performance,'now').mockReturnValue(1000);
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{next=callback;return 1;});
 vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const onScore=vi.fn(),onDone=vi.fn();
 render(<FiveAliveAward event={{id:'award',word:'APPLE',difficulty:1,points:800,from:100}} userId="user" target={createRef<HTMLDivElement>()} onDone={onDone} onScore={onScore}/>);
 expect(screen.getByText(/Very Easy/)).toBeTruthy();
 expect(scoreAudio).toHaveBeenCalledWith('user','award',expect.objectContaining({from:100,to:900}),1000);
 act(()=>next(1950));expect(onScore).toHaveBeenLastCalledWith(500);
 act(()=>next(2300));expect(onScore).toHaveBeenLastCalledWith(900);expect(onDone).toHaveBeenCalledTimes(1);
});
