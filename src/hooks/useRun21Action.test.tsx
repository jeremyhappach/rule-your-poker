// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useRun21Action} from './useRun21Action';
import {UncertainRun21Action,type PendingRun21Action} from '@/lib/run21/actionPresentation';
const command:PendingRun21Action={requestId:'request-1',roundId:'round-1',playerId:'player-1',revision:7,runRevision:9,intent:{type:'place',column:2}};
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
it('keeps one immutable request through uncertainty, blocks replacements, and resolves the original on retry',async()=>{
 const send=vi.fn().mockRejectedValueOnce(new UncertainRun21Action('lost')).mockResolvedValueOnce(undefined);
 const {result}=renderHook(()=>useRun21Action('arcade:a',true,send));
 await act(()=>result.current.submit(command));
 expect(result.current.pending).toBe(true);expect(result.current.placement).toBeNull();
 await act(()=>result.current.submit({...command,requestId:'wrong',intent:{type:'place',column:3}}));expect(send).toHaveBeenCalledTimes(1);
 await act(()=>result.current.recover());expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
 expect(result.current.pending).toBe(false);expect(sessionStorage.length).toBe(0);
});
it('recovers a lost response after remount only when confirmed state is available',async()=>{
 const send=vi.fn().mockRejectedValue(new UncertainRun21Action('lost'));
 const first=renderHook(()=>useRun21Action('arcade:a',true,send));await act(()=>first.result.current.submit(command));first.unmount();
 const resumed=vi.fn().mockResolvedValue(undefined),next=renderHook(({ready})=>useRun21Action('arcade:a',ready,resumed),{initialProps:{ready:false}});
 expect(next.result.current.pending).toBe(true);expect(resumed).not.toHaveBeenCalled();
 next.rerender({ready:true});await waitFor(()=>expect(next.result.current.pending).toBe(false));expect(resumed).toHaveBeenCalledWith(command);
});
it('retains presentation while confirmation is pending, then clears on a definitive rejection',async()=>{
 let reject!:(error:Error)=>void;const send=vi.fn(()=>new Promise<void>((_,r)=>{reject=r;}));
 const {result}=renderHook(()=>useRun21Action('multiplayer:a',true,send));let action:Promise<void>|undefined;
 act(()=>{action=result.current.submit(command);});expect(result.current.placement).toEqual(command);
 await act(async()=>{reject(Error('stale'));await action;});expect(result.current.pending).toBe(false);expect(result.current.error).toBe('stale');
});
it('does not accept a new intention while offline or before readiness and isolates old completions after scope changes',async()=>{
 let resolve!:()=>void;const send=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
 const hook=renderHook(({scope,ready})=>useRun21Action(scope,ready,send),{initialProps:{scope:'a',ready:false}});
 await act(()=>hook.result.current.submit(command));expect(send).not.toHaveBeenCalled();
 hook.rerender({scope:'a',ready:true});const offline=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 await act(()=>hook.result.current.submit(command));expect(send).not.toHaveBeenCalled();offline.mockRestore();
 act(()=>{void hook.result.current.submit(command);});hook.rerender({scope:'b',ready:true});
 await act(async()=>resolve());expect(hook.result.current.pending).toBe(false);expect(sessionStorage.getItem('run21-pending:v1:a')).toBeTruthy();
});
