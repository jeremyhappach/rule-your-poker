// @vitest-environment jsdom
import {renderHook,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({follow:vi.fn((_event:unknown)=>vi.fn()),present:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:audio}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>true}));
vi.mock('@/lib/audio/approvedSounds',()=>({approvedSound:()=>null,approvedCountdownBeat:()=>null}));
import {useDrop357Audio} from './useDrop357Audio';
import type {DropSnapshot,LaneResult} from '@/lib/drop357/model';
afterEach(()=>{cleanup();vi.clearAllMocks();});
const result=(completedAt:number):LaneResult=>({completedAt,vector:[0,13],selected:[0,1,2],natural:false,points:0,bonus:0,score:0,category:'High card'});
it('cancels an already sounding ordinary row before a final fill and emits one filled cue for a zero-score cascade',()=>{
 const surface={current:document.createElement('div')};
 let value={roundId:'r',placements:3,current:null,phase:'playing',deadline:1e6,laneResults:[result(0),null,null],result:null} as DropSnapshot;
 const h=renderHook(({v,now})=>useDrop357Audio('u',v,[0,1,2],now,surface),{initialProps:{v:value,now:200}});
 expect(audio.follow).toHaveBeenCalledTimes(1);const stop=audio.follow.mock.results[0].value;
 value={...value,placements:7,laneResults:[value.laneResults[0],result(220),result(220)],result:{reason:'filled',completedAt:220,score:0,base:0,allBonus:0,timeBonus:0,remainingMs:1000}};
 h.rerender({v:value,now:220});expect(stop).toHaveBeenCalledOnce();expect(audio.follow).toHaveBeenCalledTimes(1);
 h.rerender({v:value,now:400});h.rerender({v:value,now:460});
 expect(audio.follow).toHaveBeenCalledTimes(2);expect(audio.follow.mock.calls[1][0]).toMatchObject({id:'357-filled:r'});
});
