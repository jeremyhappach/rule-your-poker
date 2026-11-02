// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const sound=vi.hoisted(()=>vi.fn());
const rolling=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@/lib/audio/diceRollSound',()=>({startDiceRollSound:(...args:unknown[])=>{rolling.start(...args);return rolling.stop;}}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:sound}));
vi.mock('./HorsesDie',()=>({HorsesDie:({value,isRolling}:any)=><span data-value={value} data-rolling={isRolling}/> }));
import {DiceRollAnimation} from './DiceRollAnimation';
afterEach(()=>{cleanup();sound.mockClear();rolling.start.mockClear();rolling.stop.mockClear();vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each([true,false])('reveals final value at the selected landing boundary (%s)',revealOnLanding=>{
 let frame:FrameRequestCallback=()=>{};
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.spyOn(Math,'random').mockReturnValue(0);
 const h=render(<DiceRollAnimation dice={[{value:6,isHeld:false}]} animatingIndices={[0]} targetPositions={[{x:0,y:0,rotate:0}]} originPosition={{x:100,y:100}} onComplete={()=>{}} revealOnLanding={revealOnLanding}/>);
 act(()=>frame(100));act(()=>frame(800));
 expect(h.container.querySelector('[data-die-final-value]')?.getAttribute('data-die-final-value')).toBe(String(!revealOnLanding));
 act(()=>frame(1000));expect(h.container.querySelector('[data-die-final-value]')?.getAttribute('data-die-final-value')).toBe('true');
 expect(h.container.querySelector('[data-value]')?.getAttribute('data-value')).toBe('6');
});
it.each([1,2,5])('selects the approved cue for %i actually landing dice at the visible landing frame',count=>{
 let frame:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frame=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const props={audioIdentity:'round:roll',runKey:1,dice:Array.from({length:5},()=>({value:6,isHeld:false})),animatingIndices:Array.from({length:count},(_,i)=>i),targetPositions:Array.from({length:count},()=>({x:0,y:0,rotate:0})),originPosition:{x:100,y:100},onComplete:vi.fn(),revealOnLanding:true};
 const ui=render(<DiceRollAnimation {...props}/>);act(()=>frame(100));act(()=>frame(999));expect(sound).not.toHaveBeenCalled();
 act(()=>frame(1000));expect(sound).toHaveBeenCalledTimes(1);expect(sound.mock.calls[0].slice(0,2)).toEqual([count===1?'diceOne':'diceMany','round:roll']);
 ui.rerender(<DiceRollAnimation {...props}/>);expect(sound).toHaveBeenCalledTimes(1);
});
it('does not mistake the previous landing frame for a rapidly replaced roll',()=>{
 let frame:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frame=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const props={dice:[{value:6,isHeld:false}],animatingIndices:[0],targetPositions:[{x:0,y:0,rotate:0}],originPosition:{x:100,y:100},onComplete:vi.fn()};
 const ui=render(<DiceRollAnimation {...props} audioIdentity="roll:1" runKey={1}/>);act(()=>frame(100));act(()=>frame(1000));expect(sound).toHaveBeenCalledTimes(1);
 ui.rerender(<DiceRollAnimation {...props} audioIdentity="roll:2" runKey={2}/>);expect(sound).toHaveBeenCalledTimes(1);
 act(()=>frame(1100));act(()=>frame(2000));expect(sound).toHaveBeenCalledTimes(2);expect(sound.mock.lastCall?.[1]).toBe('roll:2');
});
it('starts at the first moving frame, stops before landing, and cancels on replacement/unmount',()=>{
 let frame:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frame=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const props={audioIdentity:'yahtzee:game:1',runKey:1,dice:[{value:6,isHeld:false}],animatingIndices:[0],targetPositions:[{x:0,y:0,rotate:0}],originPosition:{x:0,y:0},onComplete:vi.fn()};
 const ui=render(<DiceRollAnimation {...props}/>);expect(rolling.start).not.toHaveBeenCalled();
 act(()=>frame(0));expect(rolling.start).toHaveBeenCalledOnce();act(()=>frame(899));expect(rolling.stop).not.toHaveBeenCalled();
 act(()=>frame(900));expect(rolling.stop).toHaveBeenCalledOnce();expect(rolling.stop.mock.invocationCallOrder[0]).toBeLessThan(sound.mock.invocationCallOrder[0]);
 ui.rerender(<DiceRollAnimation {...props} audioIdentity="yahtzee:game:2" runKey={2}/>);act(()=>frame(1000));
 expect(rolling.start).toHaveBeenCalledTimes(2);const before=rolling.stop.mock.calls.length;ui.unmount();expect(rolling.stop.mock.calls.length).toBe(before+1);
});
it('cancels an interrupted roll and never restarts it on foreground recovery',()=>{
 let frame:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frame=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 render(<DiceRollAnimation audioIdentity="yahtzee:game:offline" dice={[{value:6,isHeld:false}]} animatingIndices={[0]} targetPositions={[{x:0,y:0,rotate:0}]} originPosition={{x:0,y:0}} onComplete={()=>{}}/>);
 act(()=>frame(10));act(()=>window.dispatchEvent(new Event('offline')));expect(rolling.stop).toHaveBeenCalledOnce();act(()=>window.dispatchEvent(new Event('online')));act(()=>frame(910));
 expect(rolling.start).toHaveBeenCalledOnce();expect(sound.mock.lastCall?.[2]).toBeNull();
});
