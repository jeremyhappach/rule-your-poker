// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useDiceRolloverBarrier} from './useDiceRolloverBarrier';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
afterEach(cleanup);
const base={dealer:'d',round:'r1',key:null as string|null,pending:false,show:false,complete:vi.fn(),resultObserved:false};
const batch=(pre='r1',next='r2')=>({dealer_game_id:'d',source_round_id:pre,successor_round_id:next,reason:'ante'} as ChipPresentationBatch);
it('animates exact initial admission without requiring a nonexistent predecessor receipt',()=>{
 const initial={...batch(),source_round_id:null,successor_round_id:'r1'};
 const h=renderHook(p=>useDiceRolloverBarrier(p),{initialProps:{...base,round:null as string|null}});
 expect(h.result.current.admit(initial)).toBe(false);
 h.rerender(base);expect(h.result.current.admit(initial)).toBe(true);
 h.rerender({...base,round:'r2'});expect(h.result.current.admit(initial)).toBe('reconcile');
 expect(h.result.current.admit({...initial,successor_round_id:null})).toBe('reconcile');
 expect(h.result.current.admit({...initial,dealer_game_id:'foreign'})).toBe('reconcile');
});
it('holds a batch arriving before NQ and retains the outgoing all-NQ overlay through rollover',()=>{
 const h=renderHook(p=>useDiceRolloverBarrier(p),{initialProps:base});
 expect(h.result.current.admit(batch())).toBe(false);
 h.rerender({...base,key:'d:r1:p:2',pending:true,show:true,resultObserved:true});
 h.rerender({...base,round:'r2'});
 expect(h.result.current.key).toBe('d:r1:p:2');expect(h.result.current.show).toBe(true);expect(h.result.current.admit(batch())).toBe(false);
 act(()=>h.result.current.complete());expect(h.result.current.show).toBe(false);expect(h.result.current.admit(batch())).toBe(true);
});
it('never lets a previous dismissal consume the new rounds NQ receipt',()=>{
 const h=renderHook(p=>useDiceRolloverBarrier(p),{initialProps:base});
 h.rerender({...base,key:'old',pending:true,show:true,resultObserved:true});const old=h.result.current.complete;
 h.rerender({...base,round:'r2',key:'new',pending:true,show:true,resultObserved:true});act(old);
 expect(h.result.current.key).toBe('new');expect(h.result.current.show).toBe(true);expect(h.result.current.admit(batch('r2','r3'))).toBe(false);
});
it('reconciles historical remount, missing metadata, lost terminal state and foreign dealer without waiting forever',()=>{
 const h=renderHook(p=>useDiceRolloverBarrier(p),{initialProps:base});h.rerender({...base,round:'r2'});
 expect(h.result.current.admit(batch())).toBe('reconcile');
 expect(h.result.current.admit({...batch(),successor_round_id:null})).toBe('reconcile');
 expect(h.result.current.admit({...batch(),dealer_game_id:'old'})).toBe('reconcile');
 h.unmount();const fresh=renderHook(()=>useDiceRolloverBarrier({...base,round:'r2'}));expect(fresh.result.current.admit(batch())).toBe('reconcile');
});
it('keeps successor identity exact after predecessor dismissal',()=>{
 const h=renderHook(p=>useDiceRolloverBarrier(p),{initialProps:base});h.rerender({...base,resultObserved:true});
 expect(h.result.current.admit(batch())).toBe(false);h.rerender({...base,round:'r2'});
 expect(h.result.current.admit(batch())).toBe(true);expect(h.result.current.admit(batch('r1','other'))).toBe('reconcile');
});
it('does not borrow a different local viewers completion receipt',()=>{
 const h=renderHook(p=>useDiceRolloverBarrier(p),{initialProps:{...base,owner:'p1'}});
 h.rerender({...base,owner:'p1',key:'p1-old',pending:true,show:true,resultObserved:true});const stale=h.result.current.complete;
 h.rerender({...base,owner:'p2',round:'r2'});act(stale);
 expect(h.result.current.show).toBe(false);expect(h.result.current.admit(batch())).toBe('reconcile');
});
