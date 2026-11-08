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

it.each([0,500])('uses the earned bonus for the completion tone (%i)',allBonus=>{
 const surface={current:document.createElement('div')};
 const value={roundId:'r',placements:12,current:null,phase:'stage_complete',deadline:1e6,laneResults:[result(220),result(220),result(220)],result:{reason:'filled',completedAt:220,allBonus}} as DropSnapshot;
 const h=renderHook(({now})=>useDrop357Audio('u',value,[0,1,2],now,surface),{initialProps:{now:220}});
 h.rerender({now:400});h.rerender({now:460});
 const filled=audio.follow.mock.calls.filter(([event])=>(event as {id:string}).id==='357-filled:r');
 expect(filled).toHaveLength(allBonus?1:0);
});
