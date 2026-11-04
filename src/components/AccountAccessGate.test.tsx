// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
const fake=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn(),auth:undefined as any,realtime:undefined as any,subscribe:vi.fn(),signOut:vi.fn()}));
vi.mock('@/lib/accountAccess',()=>({accountRpc:fake.rpc,sendVerification:vi.fn().mockResolvedValue(undefined),emailDeliveryMessage:(status:string)=>status==='failed'?'Email failed. Resend verification email.':'Check your inbox.'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:fake.session,signOut:fake.signOut,onAuthStateChange:(fn:any)=>{fake.auth=fn;return {data:{subscription:{unsubscribe:vi.fn()}}};}},channel:()=>({on:(_a:any,_b:any,fn:any)=>{fake.realtime=fn;return {subscribe:fake.subscribe};}}),removeChannel:vi.fn()}}));
import {AccountAccessGate} from './AccountAccessGate';
const enabled={userId:'owner',enabled:true,status:'enabled',revision:1,email:'owner@example.invalid',verified:false,admin:false};
beforeEach(()=>{vi.resetAllMocks();fake.session.mockResolvedValue({data:{session:{user:{id:'owner'}}}});fake.rpc.mockResolvedValue(enabled);});
afterEach(cleanup);
const mount=()=>render(<MemoryRouter><AccountAccessGate><div>Playable content</div></AccountAccessGate></MemoryRouter>);
it('shows pending approval and withholds gameplay while authenticated',async()=>{
 fake.rpc.mockResolvedValue({...enabled,enabled:false,status:'pending'});mount();
 expect(await screen.findByText('Account Pending Admin Approval')).toBeTruthy();expect(screen.queryByText('Playable content')).toBeNull();
});
it('permits unverified play and dismisses the reminder until the next login',async()=>{
 mount();expect(await screen.findByText('Your email is not verified')).toBeTruthy();
 expect(screen.getByText('Playable content')).toBeTruthy();fireEvent.click(screen.getByText('Continue playing'));
 await act(async()=>fake.auth('TOKEN_REFRESHED',{user:{id:'owner'}}));
 expect(screen.queryByText('Your email is not verified')).toBeNull();
 await act(async()=>fake.auth('SIGNED_OUT',null));
 await act(async()=>fake.auth('SIGNED_IN',{user:{id:'owner'}}));
 expect(await screen.findByText('Your email is not verified')).toBeTruthy();
});
it('boots on a newer suspension event and rejects a stale enabled response',async()=>{
 mount();await screen.findByText('Playable content');
 await act(async()=>fake.realtime({new:{enabled:false,ever_enabled:true,revision:2}}));
 expect(await screen.findByText('Account Suspended — Contact Administrator.')).toBeTruthy();
 expect(screen.queryByText('Playable content')).toBeNull();
 fake.rpc.mockResolvedValue({...enabled,revision:3});
 await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(await screen.findByText('Playable content')).toBeTruthy();
});
it('preserves a mounted game through a transient refresh failure',async()=>{
 mount();await screen.findByText('Playable content');fake.rpc.mockRejectedValue(Error('offline'));
 await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(screen.getByText('Playable content')).toBeTruthy();
});

it('keeps enabled gameplay accessible when dispatch fails and offers resend',async()=>{
 fake.rpc.mockResolvedValue({...enabled,emailDelivery:'failed'});mount();
 expect(await screen.findByText('Playable content')).toBeTruthy();expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Resend verification email'})).toBeTruthy();
});
