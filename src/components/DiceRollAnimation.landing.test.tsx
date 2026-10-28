// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./HorsesDie',()=>({HorsesDie:({value,isRolling}:any)=><span data-value={value} data-rolling={isRolling}/> }));
import {DiceRollAnimation} from './DiceRollAnimation';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each([true,false])('reveals final value at the selected landing boundary (%s)',revealOnLanding=>{
 let frame:FrameRequestCallback=()=>{};
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.spyOn(Math,'random').mockReturnValue(0);
 const h=render(<DiceRollAnimation dice={[{value:6,isHeld:false}]} animatingIndices={[0]} targetPositions={[{x:0,y:0,rotate:0}]} originPosition={{x:100,y:100}} onComplete={()=>{}} revealOnLanding={revealOnLanding}/>);
 act(()=>frame(100));act(()=>frame(800));
 expect(h.container.querySelector('[data-die-final-value]')?.getAttribute('data-die-final-value')).toBe(String(!revealOnLanding));
 act(()=>frame(1000));expect(h.container.querySelector('[data-die-final-value]')?.getAttribute('data-die-final-value')).toBe('true');
 expect(h.container.querySelector('[data-value]')?.getAttribute('data-value')).toBe('6');
});
