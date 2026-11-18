// @vitest-environment jsdom
import {createRef} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {FiveAliveAward} from './FiveAliveAward';
const {scoreAudio}=vi.hoisted(()=>({scoreAudio:vi.fn()}));
vi.mock('./useFiveAliveScoreAudio',()=>({useFiveAliveScoreAudio:scoreAudio}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:vi.fn(()=>()=>{})}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();scoreAudio.mockClear();});

it.each([false,true])('holds the calculation for five seconds before flight/counting (reduced motion: %s)',reduced=>{
 let next:FrameRequestCallback=()=>{};
 vi.spyOn(performance,'now').mockReturnValue(1000);
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{next=callback;return 1;});
 const cancelFrame=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 vi.stubGlobal('matchMedia',()=>({matches:reduced}));
 const animate=vi.fn<Element['animate']>().mockReturnValue({cancel:vi.fn()} as unknown as Animation),original=Element.prototype.animate;
 Element.prototype.animate=animate;
 try{
 const onScore=vi.fn(),onDone=vi.fn(),target={current:document.createElement('div')};
 const props={event:{id:'award',word:'APPLE',difficulty:1,base:343,points:274,from:100},userId:'user',target,onDone,onScore};
 const {rerender,unmount}=render(<FiveAliveAward {...props}/>);
 expect(screen.getByText('343 base × 0.8 · Very Easy')).toBeTruthy();
 expect(scoreAudio).toHaveBeenLastCalledWith('user','award',expect.objectContaining({startedAt:6000,endsAt:6700,from:100,to:374}),1000);
 if(reduced)expect(animate).not.toHaveBeenCalled();else expect(animate).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({delay:5000,duration:600}));
 for(const time of [1000,5999,6000]){act(()=>next(time));expect(onScore).toHaveBeenLastCalledWith(100);expect(onDone).not.toHaveBeenCalled();expect(screen.getByText('343 base × 0.8 · Very Easy')).toBeTruthy();}
 rerender(<FiveAliveAward {...props} event={{...props.event}}/>);
 act(()=>next(6350));expect(onScore).toHaveBeenLastCalledWith(237);expect(onDone).not.toHaveBeenCalled();
 act(()=>next(6700));expect(onScore).toHaveBeenLastCalledWith(374);expect(onDone).toHaveBeenCalledTimes(1);
 unmount();expect(cancelFrame).toHaveBeenCalled();expect(onScore).toHaveBeenLastCalledWith(null);
 }finally{Element.prototype.animate=original;}
});

it('cancels an unmounted reading interval without completing or scoring it',()=>{
 vi.spyOn(performance,'now').mockReturnValue(1000);
 vi.spyOn(window,'requestAnimationFrame').mockReturnValue(42);
 const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{}),onScore=vi.fn(),onDone=vi.fn();
 const {unmount}=render(<FiveAliveAward event={{id:'award',word:'APPLE',difficulty:1,base:1000,points:800,from:0}} userId="user" target={createRef<HTMLDivElement>()} onDone={onDone} onScore={onScore}/>);
 unmount();expect(cancel).toHaveBeenCalledWith(42);expect(onDone).not.toHaveBeenCalled();expect(onScore.mock.calls).toEqual([[null]]);
});
