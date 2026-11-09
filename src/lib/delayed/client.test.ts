import {afterEach,expect,it,vi} from 'vitest';
import {delayedRequest,DelayedRequestError} from './client';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}}}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it.each(['place','pass','collect'])('bounds a lost %s response and preserves the command for replay',async type=>{
 vi.useFakeTimers();
 const body={op:'action',game:'run21',childId:'child',requestId:'original',revision:7,segment:2,intent:{type,column:0}};
 const fetcher=vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason))));
 vi.stubGlobal('fetch',fetcher);
 const pending=delayedRequest(body);const rejected=expect(pending).rejects.toThrow('Reconnect to confirm your move');
 await vi.advanceTimersByTimeAsync(10000);await rejected;
 expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
 expect(fetcher.mock.calls[0][0]).toBe('/api/delayed-run21');
 fetcher.mockResolvedValueOnce({ok:true,json:async()=>({revision:8})} as never);
 await expect(delayedRequest(body)).resolves.toEqual({revision:8});
 expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
 expect(vi.getTimerCount()).toBe(0);
});
it('keeps the deadline active through a stalled response body',async()=>{
 vi.useFakeTimers();
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>({ok:true,json:()=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))})));
 const rejected=expect(delayedRequest({game:'run21',op:'action'})).rejects.toThrow('Connection timed out');
 await vi.advanceTimersByTimeAsync(10000);await rejected;expect(vi.getTimerCount()).toBe(0);
});
it('keeps definitive rejection distinct from an uncertain timeout',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:409,json:async()=>({error:'delayed:stale_action'})})));
 await expect(delayedRequest({game:'run21'})).rejects.toBeInstanceOf(DelayedRequestError);
 expect(vi.getTimerCount()).toBe(0);
});
it('leaves other Async games on the existing endpoint and transport',async()=>{
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({revision:2})}));vi.stubGlobal('fetch',fetcher);
 await delayedRequest({game:'boxdrop',op:'action'});
 expect(fetcher).toHaveBeenCalledWith('/api/delayed',expect.not.objectContaining({signal:expect.anything()}));
});
