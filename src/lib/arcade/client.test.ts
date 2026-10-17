import {afterEach,describe,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth}}));
import {arcadeRequest} from './client';
import {RejectedTriAction,UncertainTriAction} from '@/lib/triTowers/intentBuffer';
const body={op:'action',game:'tri-towers',requestId:'immutable-request',revision:7,roundId:'round-1',intent:{type:'draw'}};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('TriTowers transport outcome certainty',()=>{
 it('retries a lost response with the same immutable command',async()=>{
  auth.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}}});
  const fetcher=vi.fn().mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce(new Response(JSON.stringify({revision:8})));
  vi.stubGlobal('fetch',fetcher);
  await expect(arcadeRequest(body)).resolves.toEqual({revision:8});
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
 });
 it('retains uncertainty when the response was lost and the retry cannot authenticate',async()=>{
  auth.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}}});
  vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce(new Response(JSON.stringify({error:'arcade:authentication_required'}),{status:401})));
  await expect(arcadeRequest(body)).rejects.toBeInstanceOf(UncertainTriAction);
 });
 it('allows a definitive receipt-aware rejection to resolve uncertainty',async()=>{
  auth.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}}});
  vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce(new Response(JSON.stringify({error:'arcade:stale_action'}),{status:409})));
  await expect(arcadeRequest(body)).rejects.toBeInstanceOf(RejectedTriAction);
 });
});
