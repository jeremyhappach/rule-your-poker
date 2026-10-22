// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
const transport=vi.hoisted(()=>({dispatch:vi.fn()}));
vi.mock('@/lib/canonicalShell/cardTransport/CardTransportProvider',()=>({useCardTransport:()=>transport}));
import {golfMove,useGolfCardPresentation} from './useGolfCardPresentation';
const frame=()=>({id:'d',scope:'r',revision:1,phase:'playing',turnIndex:0,players:[{id:'a'},{id:'b'}],tableaus:{a:{cards:[null,0,null,null,null,null]},b:{cards:[null,null,null,null,null,null]}},pending:null,hasPending:false,discardTop:5} as unknown as GolfSnapshot);
beforeEach(()=>{transport.dispatch.mockReset().mockReturnValue(true);Object.defineProperty(document,'hidden',{configurable:true,value:false});});
it('retains the draw source and occupied destination until incoming settles, then moves the exposed face without flipping',()=>{
 const before={...frame(),hasPending:true,pending:{actor:'a',card:51}},after={...before,revision:2,pending:null,hasPending:false,discardTop:0,turnIndex:1,tableaus:{...before.tableaus,a:{...before.tableaus.a,cards:[null,51,null,null,null,null]}}};
 const h=renderHook(({v,epoch})=>useGolfCardPresentation(v,epoch,'u'),{initialProps:{v:before as GolfSnapshot,epoch:0}});
 h.rerender({v:after as GolfSnapshot,epoch:0});expect(h.result.current.card('a',1)).toBe(0);expect(h.result.current.pending?.card).toBe(51);
 expect(transport.dispatch.mock.calls[0][0].from).toEqual({kind:'tableau',playerId:'a',index:6});
 act(()=>transport.dispatch.mock.calls[0][1].onSettled());expect(h.result.current.card('a',1)).toBe(51);expect(h.result.current.pending).toBeNull();
 const outgoing=transport.dispatch.mock.calls[1][0];expect(outgoing.face).toBe('visible');expect(outgoing.visibleFace?.rank).toBe('A');expect(outgoing.from).toEqual({kind:'tableau',playerId:'a',index:7});expect(outgoing.to).toEqual({kind:'discard'});expect(h.result.current.discard).toBe(5);
 act(()=>transport.dispatch.mock.calls[1][1].onSettled());expect(h.result.current.move).toBeNull();expect(h.result.current.discard).toBe(0);expect(h.result.current.busy).toBe(false);
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
 const h=renderHook(({v})=>useGolfCardPresentation(v,0,'u'),{initialProps:{v:before as GolfSnapshot}});h.rerender({v:after as GolfSnapshot});act(()=>transport.dispatch.mock.calls[0][1].onSettled());
 expect(transport.dispatch.mock.calls[1][0]).toMatchObject({face:'hidden',from:{kind:'tableau',playerId:'a',index:7}});expect(transport.dispatch.mock.calls[1][0].visibleFace).toBeUndefined();
 act(()=>transport.dispatch.mock.calls[1][1].onSettled());expect(h.result.current.move?.stage).toBe('flip');act(()=>h.result.current.finishFlip());expect(h.result.current.discard).toBe(8);
});
