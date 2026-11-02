// @vitest-environment jsdom
import {cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({sound:vi.fn(),ctx:{gameType:'holm-game',__activeIntents:[] as any[],__markDeparted:vi.fn(),__markDropped:vi.fn(),__markArrived:vi.fn(),__markSettled:vi.fn()}}));
vi.mock('./ChipTransportProvider',()=>({useChipTransportInternal:()=>mock.ctx}));
vi.mock('./chipEndpoints',()=>({resolveChipEndpoint:()=>({x:100,y:100})}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:mock.sound}));
import {ChipTransportRuntime} from './ChipTransportRuntime';
afterEach(()=>{cleanup();vi.clearAllMocks();mock.ctx.__activeIntents=[];});
it('sounds the actual animation edge with one shared identity for every chip in a tax/ante batch',()=>{
 mock.ctx.__activeIntents=['player-a','player-b'].map((id,i)=>({id,soundIdentity:'tax-batch-uuid',amount:5,from:{kind:'seat',position:i},to:{kind:'pot'},reason:'ante',enqueueSeq:i}));
 const container={current:document.body},overlay={current:document.body};
 render(<ChipTransportRuntime containerRef={container} overlayRootRef={overlay}/>);
 expect(mock.sound).not.toHaveBeenCalled();
 const chips=document.querySelectorAll('[data-chip-transport-intent] > div');
 expect(chips).toHaveLength(2);
 // JSDOM exposes the WebKit animation style but no native AnimationEvent;
 // React consequently registers the vendor event in this environment.
 for(const node of chips)fireEvent(node,new Event('webkitAnimationStart',{bubbles:true}));
 expect(mock.sound.mock.calls.map(c=>c.slice(0,2))).toEqual([['chip','chip-transfer:tax-batch-uuid'],['chip','chip-transfer:tax-batch-uuid']]);
 expect(mock.ctx.__markDeparted).toHaveBeenCalledTimes(2);
});
it('has no sound when no live transfer has been admitted',()=>{
 render(<ChipTransportRuntime containerRef={{current:document.body}} overlayRootRef={{current:document.body}}/>);
 expect(mock.sound).not.toHaveBeenCalled();
});
