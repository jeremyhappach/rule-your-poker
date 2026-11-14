// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useRef} from 'react';
import {useYahtzeeRollSound} from './useYahtzeeRollSound';
const audio=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@/lib/audio/diceRollSound',()=>({startDiceRollSound:(...args:unknown[])=>{audio.start(...args);return audio.stop;}}));
function Tray({id=null,rolling=false,active=true}:{id?:string|null;rolling?:boolean;active?:boolean}){
 const surface=useRef<HTMLDivElement>(null);useYahtzeeRollSound(id,rolling,active,surface);return <div ref={surface}/>;
}
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('starts only a confirmed visible local roll, once, and stops at the existing visual end',()=>{
 const ui=render(<Tray/>);expect(audio.start).not.toHaveBeenCalled();
 ui.rerender(<Tray id="yahtzee:player:roll-1" rolling/>);
 expect(audio.start).toHaveBeenCalledExactlyOnceWith('yahtzee:player:roll-1',ui.container.firstChild);
 ui.rerender(<Tray id="yahtzee:player:roll-1" rolling/>);expect(audio.start).toHaveBeenCalledTimes(1);
 ui.rerender(<Tray id="yahtzee:player:roll-1"/>);expect(audio.stop).toHaveBeenCalledTimes(1);
});
it('cancels on replacement/unmount and consumes off-tab motion without a surface',()=>{
 const ui=render(<Tray id="yahtzee:player:roll-1" rolling/>);
 ui.rerender(<Tray id="yahtzee:player:roll-2" rolling active={false}/>);expect(audio.stop).toHaveBeenCalledTimes(1);
 expect(audio.start).toHaveBeenLastCalledWith('yahtzee:player:roll-2',null);ui.unmount();expect(audio.stop).toHaveBeenCalledTimes(2);
});
