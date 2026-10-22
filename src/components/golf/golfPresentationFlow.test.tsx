// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
const transport=vi.hoisted(()=>({dispatch:vi.fn()}));
vi.mock('@/lib/canonicalShell/cardTransport/CardTransportProvider',()=>({useCardTransport:()=>transport}));
import {golfMove,useGolfCardPresentation} from './useGolfCardPresentation';
const frame=()=>({id:'d',scope:'r',revision:1,phase:'playing',turnIndex:0,players:[{id:'a'},{id:'b'}],tableaus:{a:{cards:[null,0,null,null,null,null]},b:{cards:[null,null,null,null,null,null]}},pending:null,hasPending:false,discardTop:5} as unknown as GolfSnapshot);
beforeEach(()=>{vi.useFakeTimers();transport.dispatch.mockReset().mockReturnValue(true);Object.defineProperty(document,'hidden',{configurable:true,value:false});});
afterEach(()=>vi.useRealTimers());
it('retains the draw source and occupied destination until incoming settles, then moves the exposed face without flipping',()=>{
 const before={...frame(),hasPending:true,pending:{actor:'a',card:51}},after={...before,revision:2,pending:null,hasPending:false,discardTop:0,turnIndex:1,tableaus:{...before.tableaus,a:{...before.tableaus.a,cards:[null,51,null,null,null,null]}}};
 const h=renderHook(({v,epoch})=>useGolfCardPresentation(v,epoch,'u'),{initialProps:{v:before as GolfSnapshot,epoch:0}});
 h.rerender({v:after as GolfSnapshot,epoch:0});expect(h.result.current.card('a',1)).toBe(0);expect(h.result.current.pending?.card).toBe(51);
 act(()=>vi.advanceTimersByTime(180));
 expect(transport.dispatch.mock.calls[0][0].from).toEqual({kind:'tableau',playerId:'a',index:6});
 act(()=>transport.dispatch.mock.calls[0][1].onSettled());act(()=>vi.advanceTimersByTime(40));expect(h.result.current.card('a',1)).toBe(51);expect(h.result.current.pending).toBeNull();
 const outgoing=transport.dispatch.mock.calls[1][0];expect(outgoing.face).toBe('visible');expect(outgoing.visibleFace?.rank).toBe('A');expect(outgoing.from).toEqual({kind:'tableau',playerId:'a',index:7});expect(outgoing.to).toEqual({kind:'discard'});expect(h.result.current.discard).toBe(5);
 act(()=>transport.dispatch.mock.calls[1][1].onSettled());act(()=>vi.advanceTimersByTime(40));expect(h.result.current.move?.stage).toBe('rest');act(()=>vi.advanceTimersByTime(1200));expect(h.result.current.move).toBeNull();expect(h.result.current.discard).toBe(0);expect(h.result.current.busy).toBe(false);
});
it('draw transport never includes private values and reconnect ignores late callbacks',()=>{
 const before=frame(),after={...before,revision:2,hasPending:true,pending:{actor:'a',card:51}};
 const h=renderHook(({v,epoch})=>useGolfCardPresentation(v,epoch,'u'),{initialProps:{v:before,epoch:0}});h.rerender({v:after,epoch:0});
 expect(transport.dispatch.mock.calls[0][0].face).toBe('hidden');expect(transport.dispatch.mock.calls[0][0].visibleFace).toBeUndefined();
 h.rerender({v:after,epoch:1});act(()=>transport.dispatch.mock.calls[0][1].onSettled());expect(h.result.current.move).toBeNull();
});
it('seeks across revision gaps, paused snapshots, new identities and completion',()=>{
 const before=frame();for(const after of [{...before,revision:3},{...before,revision:2,id:'x'},{...before,revision:2,scope:'x'},{...before,revision:2,paused:true},{...before,revision:2,phase:'hole_complete' as const}])expect(golfMove(before,after)).toBeNull();
});

it('flies a concealed outgoing card as a back, then flips only on discard arrival',()=>{
 const before={...frame(),hasPending:true,pending:{actor:'a',card:51}},after={...before,revision:2,pending:null,hasPending:false,discardTop:8,tableaus:{...before.tableaus,a:{...before.tableaus.a,cards:[51,0,null,null,null,null]}}};
 const h=renderHook(({v})=>useGolfCardPresentation(v,0,'u'),{initialProps:{v:before as GolfSnapshot}});h.rerender({v:after as GolfSnapshot});act(()=>vi.advanceTimersByTime(180));act(()=>transport.dispatch.mock.calls[0][1].onSettled());
 act(()=>vi.advanceTimersByTime(40));expect(transport.dispatch.mock.calls[1][0]).toMatchObject({face:'hidden',from:{kind:'tableau',playerId:'a',index:7}});expect(transport.dispatch.mock.calls[1][0].visibleFace).toBeUndefined();
 act(()=>transport.dispatch.mock.calls[1][1].onSettled());expect(h.result.current.move?.stage).toBe('flip');act(()=>h.result.current.finishFlip());expect(h.result.current.discard).toBe(8);
});

it('queues a bot replacement behind its private draw without publishing its pending value',()=>{
 const before=frame(),draw={...before,revision:2,hasPending:true,pending:null},replace={...draw,revision:3,hasPending:false,turnIndex:1,discardTop:0,tableaus:{...draw.tableaus,a:{...draw.tableaus.a,cards:[null,51,null,null,null,null]}}};
 const h=renderHook(({v})=>useGolfCardPresentation(v,0,'u'),{initialProps:{v:before}});
 h.rerender({v:draw});expect(h.result.current.pendingActor).toBe('a');expect(transport.dispatch.mock.calls[0][0]).toMatchObject({face:'hidden',to:{kind:'tableau',playerId:'a',index:6}});
 h.rerender({v:replace});expect(h.result.current.move?.stage).toBe('draw');expect(h.result.current.card('a',1)).toBe(0);
 act(()=>transport.dispatch.mock.calls[0][1].onSettled());act(()=>vi.advanceTimersByTime(180));expect(h.result.current.move?.stage).toBe('select');
 act(()=>vi.advanceTimersByTime(180));expect(h.result.current.move?.stage).toBe('incoming');expect(transport.dispatch.mock.calls[1][0].from).toEqual({kind:'tableau',playerId:'a',index:6});
 act(()=>transport.dispatch.mock.calls[1][1].onSettled());act(()=>vi.advanceTimersByTime(40));expect(h.result.current.move?.stage).toBe('outgoing');expect(h.result.current.card('a',1)).toBe(51);
 act(()=>transport.dispatch.mock.calls[2][1].onSettled());act(()=>vi.advanceTimersByTime(40));act(()=>vi.advanceTimersByTime(1200));expect(h.result.current.busy).toBe(false);
});

it('recognizes a coalesced stock replacement and animates a hidden rejection',()=>{
 const before={...frame(),stockCount:39},after={...before,revision:3,stockCount:38,discardTop:8,turnIndex:1,tableaus:{...before.tableaus,a:{...before.tableaus.a,cards:[null,51,null,null,null,null]}}};
 expect(golfMove(before,after)).toMatchObject({bundled:true,stock:true,stage:'draw',index:1});
 const h=renderHook(({v})=>useGolfCardPresentation(v,0,'u'),{initialProps:{v:{...before,hasPending:true}}});
 h.rerender({v:{...before,revision:2,turnIndex:1,discardTop:8,hasPending:false}});
 expect(h.result.current.move?.stage).toBe('reject');expect(transport.dispatch.mock.calls[0][0]).toMatchObject({face:'hidden',to:{kind:'discard'}});
 act(()=>transport.dispatch.mock.calls[0][1].onSettled());expect(h.result.current.move?.stage).toBe('flip');
});

it('retains the last replacement without exposing the other final-reveal cards early',()=>{
 const before={...frame(),hasPending:true,pending:{actor:'a',card:51}},after={...before,revision:2,phase:'hole_complete',hasPending:false,pending:null,discardTop:8,presentation:{hidden:{a:[2,3,4,5]}},tableaus:{...before.tableaus,a:{cards:[51,0,2,3,4,5]}}} as unknown as GolfSnapshot;
 const h=renderHook(({v})=>useGolfCardPresentation(v,0,'u'),{initialProps:{v:before as GolfSnapshot}});h.rerender({v:after});
 expect(h.result.current.move?.index).toBe(0);expect(h.result.current.card('a',2)).toBeNull();
 act(()=>vi.advanceTimersByTime(180));act(()=>transport.dispatch.mock.calls[0][1].onSettled());act(()=>vi.advanceTimersByTime(40));expect(h.result.current.card('a',0)).toBe(51);expect(h.result.current.card('a',2)).toBeNull();
 act(()=>transport.dispatch.mock.calls[1][1].onSettled());act(()=>h.result.current.finishFlip());act(()=>vi.advanceTimersByTime(40));expect(h.result.current.card('a',2)).toBe(2);
});

it('recognizes the final move plus the atomic settlement revision as one visual replacement',()=>{
 const before={...frame(),hasPending:true,pending:{actor:'a',card:51}};
 const after={...before,revision:3,settled:true,phase:'complete',hasPending:false,pending:null,discardTop:8,presentation:{hidden:{a:[2,3,4,5]}},tableaus:{...before.tableaus,a:{cards:[51,0,2,3,4,5]}}} as unknown as GolfSnapshot;
 expect(golfMove(before,after)).toMatchObject({actor:'a',index:0,stage:'select'});
});
