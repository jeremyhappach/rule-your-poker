// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {useNoQualifyPresentation} from './useNoQualifyPresentation';
afterEach(cleanup);
const live={isComplete:false,rollKey:1,result:undefined as {isQualified:boolean}|undefined},nq={isComplete:true,rollKey:2,result:{isQualified:false} as {isQualified:boolean}|undefined};
it('blocks on the same render as completion, through the roll boundary and overlay dismissal',()=>{
 const h=renderHook(({state,ready})=>useNoQualifyPresentation('dealer:round:player',state,ready),{initialProps:{state:live,ready:false}});
 h.rerender({state:nq,ready:false});expect(h.result.current.pending).toBe(true);expect(h.result.current.show).toBe(false);
 h.rerender({state:nq,ready:true});expect(h.result.current.show).toBe(true);
 act(()=>h.result.current.complete());expect(h.result.current.pending).toBe(false);
});
it('does not replay hydration and ignores a previous round completion callback',()=>{
 const h=renderHook(({scope,state})=>useNoQualifyPresentation(scope,state,true),{initialProps:{scope:'r1',state:nq}});
 expect(h.result.current.pending).toBe(false);
 h.rerender({scope:'r2',state:live});h.rerender({scope:'r2',state:nq});const old=h.result.current.complete;
 h.rerender({scope:'r3',state:live});h.rerender({scope:'r3',state:nq});act(old);
 expect(h.result.current.pending).toBe(true);
});
