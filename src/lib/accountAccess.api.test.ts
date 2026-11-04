import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),signInWithOtp:vi.fn(),verifyOtp:vi.fn(),signOut:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({rpc:mocks.rpc,auth:mocks})}));
import handler from '../../api/account-access';
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv('RUN21_SUPABASE_URL','https://xvhmbuppghwmwpwrkzao.supabase.co');
 vi.stubEnv('RUN21_SUPABASE_SERVICE_ROLE_KEY','test-only');
 mocks.signOut.mockResolvedValue({error:null});
});
async function request(body:unknown,authorization?:string){
 const response={statusCode:200,setHeader:vi.fn(),end:vi.fn()};
 await handler({method:'POST',headers:{host:'example.test',origin:'https://example.test',authorization},body} as never,response as never);
 return {status:response.statusCode,body:JSON.parse(response.end.mock.calls[0][0])};
}
it('rejects invalid possession tokens without writing verification evidence',async()=>{
 mocks.verifyOtp.mockResolvedValue({error:Error('expired'),data:{user:null}});
 expect((await request({op:'verify',tokenHash:'a'.repeat(64),email:'forged@test.invalid'})).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it('records only the verified Auth identity/address and discards the temporary session',async()=>{
 mocks.verifyOtp.mockResolvedValue({error:null,data:{user:{id:'verified-owner',email:'owner@example.invalid'}}});
 mocks.rpc.mockResolvedValue({error:null});
 expect((await request({op:'verify',tokenHash:'a'.repeat(64),targetId:'attacker',email:'forged@test.invalid'})).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith('account_email_verified',{p_user:'verified-owner',p_email:'owner@example.invalid'});
 expect(mocks.signOut).toHaveBeenCalledWith({scope:'local'});
});
it('does not send mail when target authorization or the resend rate limit rejects',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null});
 mocks.rpc.mockResolvedValue({error:{message:'account:forbidden'}});
 expect((await request({op:'resend',targetId:'22222222-2222-4222-8222-222222222222'},'Bearer valid')).status).toBe(403);
 expect(mocks.signInWithOtp).not.toHaveBeenCalled();
});
it('uses the current database email and never creates an account on resend',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null});
 mocks.rpc.mockResolvedValue({data:{email:'current@example.invalid',attemptId:'attempt',skipped:false},error:null});mocks.signInWithOtp.mockResolvedValue({error:null});
 expect((await request({op:'resend',email:'forged@example.invalid'},'Bearer valid')).status).toBe(200);
 expect(mocks.signInWithOtp).toHaveBeenCalledWith({email:'current@example.invalid',options:{shouldCreateUser:false}});
});

it('records provider failure without claiming delivery or verification',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null});
 mocks.rpc.mockResolvedValue({data:{email:'current@example.invalid',attemptId:'attempt',skipped:false},error:null});
 mocks.signInWithOtp.mockResolvedValue({error:Error('SMTP unavailable')});
 const result=await request({op:'initial'},'Bearer valid');expect(result.status).toBe(503);expect(result.body.error).toMatch(/Resend/);
 expect(mocks.rpc).toHaveBeenCalledWith('account_email_dispatch_finish',{p_target:'11111111-1111-4111-8111-111111111111',p_attempt:'attempt',p_success:false});
});
it('deduplicates initial sends after signup and auth restoration',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null});mocks.rpc.mockResolvedValue({data:{skipped:true},error:null});
 expect((await request({op:'initial'},'Bearer valid')).status).toBe(200);expect(mocks.signInWithOtp).not.toHaveBeenCalled();
});
