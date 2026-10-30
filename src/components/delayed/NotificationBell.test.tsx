// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,useNavigate} from 'react-router-dom';
const mocks=vi.hoisted(()=>({request:vi.fn(()=>()=>{}),items:[] as any[],changed:()=>{},rpc:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:mocks.request}}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:mocks.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>{const c={on:(_a:any,_b:any,changed:()=>void)=>{mocks.changed=changed;return c;},subscribe:()=>c};return c;},removeChannel(){}}}));
import {NotificationProvider,NotificationBell} from './NotificationBell';
const notice={id:'n',match_id:'m',kind:'turn',revision:1,read_revision:0,actionable:true,payload:{availableCount:1,lastCall:false}};
beforeEach(()=>{sessionStorage.clear();mocks.items=[];mocks.request.mockClear();mocks.rpc.mockImplementation(async()=>({items:mocks.items,actionable:mocks.items.length}));});afterEach(cleanup);
function mount(path='/'){return render(<MemoryRouter initialEntries={[path]}><NotificationProvider><NotificationBell/></NotificationProvider></MemoryRouter>);}
it('keeps match access in the empty bell',async()=>{mount();const bell=await screen.findByRole('button',{name:'Notifications'});fireEvent.click(bell);expect(await screen.findByRole('link',{name:'My Async matches'})).not.toBeNull();expect(mocks.request).not.toHaveBeenCalled();});
it('sounds for new pending revisions in the lobby, never unchanged refresh/read updates',async()=>{
 mocks.items=[notice];mount();await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(1));expect(screen.getByRole('button',{name:/Notifications/}).getAttribute('data-pending')).toBe('true');
 await act(async()=>mocks.changed());expect(mocks.request).toHaveBeenCalledTimes(1);
 mocks.items=[{...notice,read_revision:1}];await act(async()=>mocks.changed());expect(mocks.request).toHaveBeenCalledTimes(1);
 mocks.items=[{...notice,revision:2}];await act(async()=>mocks.changed());expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('does not ring or sound at the game table',async()=>{mocks.items=[notice];mount('/delayed/m/play/c');await waitFor(()=>expect(mocks.rpc).toHaveBeenCalled());expect(mocks.request).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();});

it('names the inviter and keeps completed-match links independent of the active list',async()=>{
 mocks.items=[{...notice,kind:'invitation',payload:{...notice.payload,opponentId:'inviter',opponentName:'WRONG PLACEHOLDER'}},{...notice,id:'done',kind:'settled'}];mocks.rpc.mockImplementation(async(name)=>name==='delayed_home'?{id:'m',organizer:'inviter',opponent:'user',players:[{id:'user',name:'Me'},{id:'inviter',name:'Hap'}]}:{items:mocks.items,actionable:2});mount();
 fireEvent.click(await screen.findByRole('button',{name:/2 pending/}));expect(await screen.findByText('Pending invite from Hap')).toBeTruthy();
 expect(screen.getByRole('link',{name:/Match complete/}).getAttribute('href')).toBe('/delayed/m?finale=1');
});

it.each(['new','existing'])('resolves %s invitation UUIDs through match authority with no placeholder flash',async age=>{
 let resolve!:(value:any)=>void;const home=new Promise(r=>resolve=r);
 mocks.items=[{...notice,kind:'invitation',created_at:age==='existing'?'2026-10-28':'2026-10-29',payload:{opponentId:'organizer'}}];
 mocks.rpc.mockImplementation(async name=>name==='delayed_home'?home:{items:mocks.items,actionable:1});mount();
 fireEvent.click(await screen.findByRole('button',{name:/1 pending/}));expect(screen.getByText('Pending invite')).toBeTruthy();expect(screen.queryByText(/your opponent|player one/i)).toBeNull();
 await act(async()=>resolve({id:'m',organizer:'organizer',opponent:'user',players:[{id:'user',name:'Viewer'},{id:'organizer',name:'Jeremy Happach'}]}));
 expect(await screen.findByText('Pending invite from Jeremy Happach')).toBeTruthy();
});
it('never uses a mismatched match or a payload placeholder as invitation identity',async()=>{
 mocks.items=[{...notice,kind:'invitation',payload:{opponentId:'organizer',opponentName:'your opponent'}}];
 mocks.rpc.mockImplementation(async name=>name==='delayed_home'?{id:'different',organizer:'organizer',opponent:'user',players:[{id:'organizer',name:'Wrong person'}]}:{items:mocks.items,actionable:1});mount();
 fireEvent.click(await screen.findByRole('button',{name:/1 pending/}));await act(async()=>{});expect(screen.getByText('Pending invite')).toBeTruthy();expect(screen.queryByText(/Wrong person|your opponent/i)).toBeNull();
});

it.each(['/delayed','/delayed/m','/delayed/m/play/c','/delayed/m?review=c'])('hides on direct %s entry while keeping updates',async path=>{mocks.items=[notice];mount(path);expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();await act(async()=>{});const before=mocks.rpc.mock.calls.length;await act(async()=>mocks.changed());expect(mocks.rpc.mock.calls.length).toBeGreaterThan(before);expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();});
function Navigation(){const navigate=useNavigate();return <><button onClick={()=>navigate('/delayed/m/play/c')}>Async</button><button onClick={()=>navigate('/')}>Main</button><NotificationBell/></>;}
it('keeps the provider alive across routes and returns updated unread state to main lobby',async()=>{mocks.items=[notice];render(<MemoryRouter><NotificationProvider><Navigation/></NotificationProvider></MemoryRouter>);await screen.findByRole('button',{name:/1 pending/});fireEvent.click(screen.getByRole('button',{name:'Async'}));expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();mocks.items=[notice,{...notice,id:'second'}];await act(async()=>mocks.changed());fireEvent.click(screen.getByRole('button',{name:'Main'}));expect(await screen.findByRole('button',{name:/2 pending/})).toBeTruthy();});
