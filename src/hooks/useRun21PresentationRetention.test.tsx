// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {useRun21PresentationRetention} from './useRun21PresentationRetention';
const first={dealerGameId:'match',firstRoundId:'first',players:['a','b']};
it('retains the observed match across setup and successor arrival until its immutable completion',()=>{
 const {result,rerender}=renderHook(({live})=>useRun21PresentationRetention('session',live),{initialProps:{live:first as typeof first|null}});
 rerender({live:{...first,firstRoundId:'third'}});
 rerender({live:null});expect(result.current.pending?.snapshot.firstRoundId).toBe('first');
 rerender({live:{...first,dealerGameId:'successor'}});expect(result.current.pending?.snapshot.dealerGameId).toBe('match');
 act(()=>{expect(result.current.complete('run21|winseq|session|successor|1|receipt|first')).toBe(false);});
 expect(result.current.pending).not.toBeNull();
 act(()=>{expect(result.current.complete('run21|winseq|session|match|1|receipt|first')).toBe(true);});
 expect(result.current.pending).toBeNull();
});
it('does not start a historical presentation on fresh reconnect or leak it across sessions',()=>{
 const {result,rerender}=renderHook(({session,live})=>useRun21PresentationRetention(session,live),{initialProps:{session:'session',live:null as typeof first|null}});
 expect(result.current.pending).toBeNull();rerender({session:'session',live:first});rerender({session:'session',live:null});expect(result.current.pending).not.toBeNull();
 rerender({session:'other',live:null});expect(result.current.pending).toBeNull();
});
