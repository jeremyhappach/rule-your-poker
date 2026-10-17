import {afterEach,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({getSession:vi.fn().mockResolvedValue({data:{session:{access_token:'synthetic'}}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth}}));
import {run21Request} from './localClient';
import {arcadeRequest} from '../arcade/client';
import {UncertainRun21Action} from './actionPresentation';
const command={game:'run21',op:'action',requestId:'immutable',revision:1,roundId:'round',intent:{type:'place',column:0}};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
for(const [mode,request] of [['arcade',()=>arcadeRequest(command)],['multiplayer',()=>run21Request('game','action',command)]] as const){
 it(mode+' retries a lost response without changing the command',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockResolvedValueOnce(new Response(JSON.stringify({ok:true})));
  vi.stubGlobal('fetch',fetcher);await expect(request()).resolves.toEqual({ok:true});expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
 });
 it(mode+' retains uncertainty for a server failure or an interrupted JSON body',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"error":"failure"}',{status:503})));await expect(request()).rejects.toBeInstanceOf(UncertainRun21Action);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{')));await expect(request()).rejects.toBeInstanceOf(UncertainRun21Action);
 });
 it(mode+' bounds a stalled response body without admitting a new request',async()=>{
  vi.useFakeTimers();const fetcher=vi.fn((_url,options)=>Promise.resolve({status:200,ok:true,headers:new Headers(),json:()=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))))}));
  vi.stubGlobal('fetch',fetcher);const result=expect(request()).rejects.toBeInstanceOf(UncertainRun21Action);await vi.advanceTimersByTimeAsync(10001);await result;expect(fetcher).toHaveBeenCalledTimes(1);
 });
}
