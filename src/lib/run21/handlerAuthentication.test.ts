// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import type {IncomingMessage,ServerResponse} from 'node:http';
const db=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn(),removeAllChannels:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>db}));
import {createRun21Handler} from '../../../server/run21/handler';
const user='00000000-0000-4000-8000-000000000001';
const token=()=>`e30.${Buffer.from(JSON.stringify({sub:user})).toString('base64url')}.signature`;
afterEach(()=>vi.resetAllMocks());
it.each([true,false])('never trusts a speculative allowlist result before Auth verifies the same user (identity matches: %s)',async matches=>{
 let authenticate!:(value:unknown)=>void;
 db.auth.getUser.mockReturnValue(new Promise(resolve=>{authenticate=resolve;}));
 db.rpc.mockResolvedValue({data:true,error:null});
 const runtime=createRun21Handler({url:'https://example.invalid',key:'test'});
 const res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
 const req={url:'/not-a-route',method:'GET',headers:{authorization:`Bearer ${token()}`},socket:{}} as IncomingMessage;
 const pending=runtime.handler(req,res);await Promise.resolve();
 expect(db.rpc).toHaveBeenCalledWith('run21_server_authorize',{p_user_id:user});
 expect(res.end).not.toHaveBeenCalled();
 authenticate({data:{user:{id:matches?user:'00000000-0000-4000-8000-000000000002'}},error:null});
 await pending;expect(res.writeHead).toHaveBeenCalledWith(matches?404:401,expect.anything());runtime.dispose();
});
it('rejects verified but non-allowlisted callers',async()=>{
 db.auth.getUser.mockResolvedValue({data:{user:{id:user}},error:null});db.rpc.mockResolvedValue({data:false,error:null});
 const runtime=createRun21Handler({url:'https://example.invalid',key:'test'});
 const res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
 await runtime.handler({url:'/not-a-route',method:'GET',headers:{authorization:`Bearer ${token()}`},socket:{}} as IncomingMessage,res);
 expect(res.writeHead).toHaveBeenCalledWith(403,expect.anything());runtime.dispose();
});
