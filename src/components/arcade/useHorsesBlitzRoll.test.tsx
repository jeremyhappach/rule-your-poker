// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {BlitzCommand,BlitzSnapshot} from '@/lib/horsesBlitz/model';
vi.mock('@/lib/geometryLab/quintzeeRollTiming',()=>({useQuintzeeRollTiming:()=>({durationMs:1500})}));
import {useHorsesBlitzRoll} from './useHorsesBlitzRoll';
const source={handId:'run:1:1',roll:2,dice:[1,4,4,2,6],phase:'playing'} as BlitzSnapshot;
const command={requestId:'roll-three',intent:{type:'roll',items:[0,1,2]}} as BlitzCommand;
type Cue={command:BlitzCommand;snapshot:BlitzSnapshot}|null;
afterEach(()=>{cleanup();vi.useRealTimers();});
it('locks synchronously, animates the accepted mask, then shows an auto-bank landing before releasing',()=>{
 vi.useFakeTimers();
 const h=renderHook(({cue})=>useHorsesBlitzRoll(cue,'',true),{initialProps:{cue:null as Cue}});
 act(()=>{h.result.current.start(command,source,[0,1,2]);expect(h.result.current.locked()).toBe(true);});
 const landing={...source,roll:3,phase:'banking'} as BlitzSnapshot;
 h.rerender({cue:{command,snapshot:landing}});
 act(()=>vi.advanceTimersByTime(1499));expect(h.result.current.motion?.settled).toBe(false);
 expect(h.result.current.motion?.held).toEqual([0,1,2]);
 act(()=>vi.advanceTimersByTime(1));expect(h.result.current.motion?.landing).toBe(landing);expect(h.result.current.motion?.settled).toBe(true);
 act(()=>vi.advanceTimersByTime(450));expect(h.result.current.motion).toBeNull();expect(h.result.current.locked()).toBe(false);
});
it('does not land on another request and retires interrupted motion',()=>{
 vi.useFakeTimers();
 const h=renderHook(({cue,ready})=>useHorsesBlitzRoll(cue,'',ready),{initialProps:{cue:null as Cue,ready:true}});
 act(()=>h.result.current.start(command,source,[]));
 h.rerender({cue:{command:{...command,requestId:'older'},snapshot:source},ready:true});
 act(()=>vi.advanceTimersByTime(1500));expect(h.result.current.motion?.landing).toBeNull();
 h.rerender({cue:null,ready:false});expect(h.result.current.locked()).toBe(false);
});
