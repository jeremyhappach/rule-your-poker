import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),operation:vi.fn(),createClient:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.createClient}));
vi.mock('../../../server/arcade/service.js',()=>({arcadeOperation:mocks.operation}));
import handler from '../../../api/arcade';
async function request(headers:Record<string,string>={},body:unknown={op:'state'},method='POST'){
 const req=Object.assign(Readable.from([]),{method,headers:{host:'holm357.com',...headers},body});
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn()};
 await handler(req as any,res as any);return {status:res.statusCode,body:JSON.parse(res.end.mock.calls[0][0])};
}
beforeEach(()=>{
 vi.clearAllMocks();
 vi.stubEnv('RUN21_SUPABASE_URL','https://xvhmbuppghwmwpwrkzao.supabase.co');
 vi.stubEnv('RUN21_SUPABASE_SERVICE_ROLE_KEY','test-only');
 mocks.getUser.mockResolvedValue({data:{user:{id:'verified-user'}},error:null});
 const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:{username:'Verified'}})};
 mocks.createClient.mockReturnValue({auth:{getUser:mocks.getUser},from:()=>chain});
 mocks.operation.mockResolvedValue({verified:true});
});
describe('Arcade HTTP authentication boundary',()=>{
 it('rejects anonymous requests before creating a privileged client',async()=>{
  expect((await request()).status).toBe(401);expect(mocks.createClient).not.toHaveBeenCalled();
 });
 it('rejects a foreign origin before authentication',async()=>{
  expect((await request({origin:'https://elsewhere.example',authorization:'Bearer valid'})).body.error).toBe('arcade:origin');expect(mocks.getUser).not.toHaveBeenCalled();
 });
 it('checks the supplied bearer with fresh auth and rejects revoked credentials',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:null},error:Error('revoked')});
  expect((await request({authorization:'Bearer revoked'})).status).toBe(401);
  expect(mocks.getUser).toHaveBeenCalledWith('revoked');expect(mocks.operation).not.toHaveBeenCalled();
 });
 it('uses verified identity even if the browser submits another owner or score',async()=>{
  const body={op:'action',userId:'forged',score:999999};
  expect((await request({authorization:'Bearer valid',origin:'https://holm357.com'},body)).body).toEqual({verified:true});
  expect(mocks.operation).toHaveBeenCalledWith(expect.any(Function),'verified-user','Verified',body);
 });
 it('rejects oversized requests and unavailable authority without leaking secrets',async()=>{
  expect((await request({authorization:'Bearer valid'},'x'.repeat(4097))).body.error).toBe('arcade:request_size');
  vi.stubEnv('RUN21_SUPABASE_URL','https://wrong.example');
  expect((await request({authorization:'Bearer valid'})).status).toBe(503);expect(mocks.operation).not.toHaveBeenCalled();
 });
});
