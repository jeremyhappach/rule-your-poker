// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
const fake=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn(),auth:undefined as any,realtime:undefined as any}));
vi.mock('@/lib/accountAccess',()=>({accountRpc:fake.rpc,sendVerification:vi.fn(),emailDeliveryMessage:()=>''}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:fake.session,signOut:vi.fn(),onAuthStateChange:(fn:any)=>{fake.auth=fn;return {data:{subscription:{unsubscribe:vi.fn()}}};}},channel:()=>({on:(_a:any,_b:any,fn:any)=>{fake.realtime=fn;return {subscribe:vi.fn()};}}),removeChannel:vi.fn()}}));
import {AccountAccessGate} from './AccountAccessGate';
const owner='11111111-1111-4111-8111-111111111111',match='22222222-2222-4222-8222-222222222222',eventId='33333333-3333-4333-8333-333333333333';
const access={userId:owner,enabled:true,status:'enabled',revision:1,email:'owner@example.invalid',verified:true,admin:false};
const session=()=>({user:{id:owner},expires_at:Math.floor(Date.now()/1000)+3600});
let worker:EventTarget,paths:string[];
beforeEach(()=>{vi.resetAllMocks();paths=[];worker=new EventTarget();Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:worker});fake.session.mockResolvedValue({data:{session:session()}});fake.rpc.mockResolvedValue(access);});
afterEach(()=>{cleanup();vi.useRealTimers();});
function Location(){const {pathname}=useLocation();paths.push(pathname);return <p>{pathname}</p>;}
const mount=(path='/arcade')=>render(<MemoryRouter initialEntries={[path]}><Location/><AccountAccessGate><span>Authorized content</span></AccountAccessGate></MemoryRouter>);
async function tap(overrides:Record<string,unknown>={},source='/ptown-push-sw.js'){
 const ack=vi.fn();const event=new MessageEvent('message',{data:{type:'push-match-navigation',destination:{userId:owner,matchId:match,eventId,...overrides}}});
 Object.defineProperties(event,{source:{value:{scriptURL:new URL(source,location.origin).href}},ports:{value:[{postMessage:ack}]}});
 await act(async()=>worker.dispatchEvent(event));return ack;
}
it('reuses valid access for the exact match, consumes duplicate taps once and performs no extra check',async()=>{
 mount();await screen.findByText('Authorized content');const count=fake.rpc.mock.calls.length;
 expect(await tap()).toHaveBeenCalledWith({accepted:true,eventId});
 expect(screen.getByText('/delayed/'+match)).toBeTruthy();await tap();
 expect(paths.filter(p=>p==='/delayed/'+match)).toHaveLength(1);expect(fake.rpc).toHaveBeenCalledTimes(count);
});
it('keeps a running check alive and drains one destination after success',async()=>{
 let finish!:(v:any)=>void;fake.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));mount();
 await waitFor(()=>expect(fake.rpc).toHaveBeenCalledTimes(1));await tap();await tap();
 expect(screen.getByText('/arcade')).toBeTruthy();expect(fake.rpc).toHaveBeenCalledTimes(1);
 await act(async()=>finish(access));expect(screen.getByText('/delayed/'+match)).toBeTruthy();
});
it('waits for an existing foreground recheck and offers Retry plus a safe lobby exit on failure',async()=>{
 mount();await screen.findByText('Authorized content');let fail!:(e:Error)=>void;
 fake.rpc.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
 await act(async()=>window.dispatchEvent(new Event('focus')));await tap();expect(screen.getByText('/arcade')).toBeTruthy();
 await act(async()=>fail(Error('offline')));expect(screen.getByRole('alert')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Back to Lobby'}));expect(screen.getByText('/')).toBeTruthy();expect(screen.getByText('Authorized content')).toBeTruthy();
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(screen.queryByText('/delayed/'+match)).toBeNull();
});
it('retains a failed pending link for one successful retry',async()=>{
 fake.rpc.mockRejectedValueOnce(Error('offline'));mount();await screen.findByRole('alert');await tap();
 expect(screen.getByText('/arcade')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Retry'}));
 expect(await screen.findByText('/delayed/'+match)).toBeTruthy();expect(fake.rpc).toHaveBeenCalledTimes(2);
});
it('never admits a cold or suspended account and rejects a late lower revision',async()=>{
 fake.rpc.mockResolvedValue({...access,enabled:false,status:'suspended',revision:2});mount('/delayed/'+match);
 expect(await screen.findByText('Account Suspended — Contact Administrator.')).toBeTruthy();await tap();
 fake.rpc.mockResolvedValue(access);await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(screen.queryByText('Authorized content')).toBeNull();
});
it('restores an expired session before using the previously enabled snapshot',async()=>{
 vi.useFakeTimers();const original=session();fake.session.mockResolvedValue({data:{session:original}});mount();
 await act(async()=>{});expect(screen.getByText('Authorized content')).toBeTruthy();
 vi.setSystemTime((original.expires_at+1)*1000);await tap();
 expect(screen.queryByText('/delayed/'+match)).toBeNull();expect(screen.queryByText('Authorized content')).toBeNull();
 expect(screen.getByRole('button',{name:'Retry'})).toBeTruthy();
 fake.session.mockResolvedValue({data:{session:session()}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Retry'})));
 expect(screen.getByText('/delayed/'+match)).toBeTruthy();
});
it('does not discard session restoration on an ignored transient null auth event',async()=>{
 let finish!:(v:any)=>void;fake.session.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));mount();
 await act(async()=>fake.auth('TOKEN_REFRESHED',null));await tap();
 await act(async()=>finish({data:{session:session()}}));expect(screen.getByText('/delayed/'+match)).toBeTruthy();
});
it('rejects other-account, malformed and foreign-worker destinations',async()=>{
 mount();await screen.findByText('Authorized content');
 await tap({userId:'44444444-4444-4444-8444-444444444444'});
 expect(await tap({matchId:'https://evil.invalid'})).not.toHaveBeenCalled();
 expect(await tap({},'https://evil.invalid/ptown-push-sw.js')).not.toHaveBeenCalled();
 expect(screen.getByText('/arcade')).toBeTruthy();
});
it('cannot drain a pending match after an account switch and late old-account response',async()=>{
 let finish!:(v:any)=>void;fake.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));mount();
 await waitFor(()=>expect(fake.rpc).toHaveBeenCalledTimes(1));await tap();
 const other='44444444-4444-4444-8444-444444444444';fake.rpc.mockResolvedValue({...access,userId:other});
 await act(async()=>fake.auth('SIGNED_IN',{...session(),user:{id:other}}));
 await screen.findByText('Authorized content');await act(async()=>finish(access));
 expect(screen.getByText('/arcade')).toBeTruthy();
});
it('times out the pending check, retries once, and ignores the obsolete late result',async()=>{
 vi.useFakeTimers();let finish!:(v:any)=>void;fake.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));mount();
 await act(async()=>{});await tap();await act(async()=>vi.advanceTimersByTimeAsync(10001));
 expect(screen.getByRole('button',{name:'Back to Lobby'})).toBeTruthy();expect(screen.queryByText('/delayed/'+match)).toBeNull();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Retry'})));
 expect(screen.getByText('/delayed/'+match)).toBeTruthy();await act(async()=>finish({...access,enabled:false,revision:99}));
 expect(screen.getByText('Authorized content')).toBeTruthy();expect(fake.rpc).toHaveBeenCalledTimes(2);
});
it('a cold failure can cancel the match destination without granting unchecked lobby access',async()=>{
 fake.rpc.mockRejectedValueOnce(Error('offline'));mount('/delayed/'+match);await screen.findByRole('alert');await tap();
 fireEvent.click(screen.getByRole('button',{name:'Back to Lobby'}));expect(screen.getByText('/')).toBeTruthy();expect(screen.queryByText('Authorized content')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText('Authorized content');expect(screen.getByText('/')).toBeTruthy();
});
