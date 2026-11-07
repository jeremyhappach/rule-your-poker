// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,useNavigate,useLocation} from 'react-router-dom';
const mocks=vi.hoisted(()=>({request:vi.fn(()=>()=>{}),items:[] as any[],changed:()=>{},rpc:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:mocks.request}}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:mocks.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>{const c={on:(_a:any,_b:any,changed:()=>void)=>{mocks.changed=changed;return c;},subscribe:()=>c};return c;},removeChannel(){}}}));
import {NotificationProvider,NotificationBell} from './NotificationBell';
const notice={id:'n',match_id:'m',kind:'turn',revision:1,read_revision:0,actionable:true,payload:{availableCount:1,lastCall:false}};
beforeEach(()=>{sessionStorage.clear();mocks.items=[];mocks.request.mockClear();mocks.rpc.mockImplementation(async()=>({items:mocks.items,actionable:mocks.items.length}));});afterEach(cleanup);
function mount(path='/'){return render(<MemoryRouter initialEntries={[path]}><NotificationProvider><NotificationBell/></NotificationProvider></MemoryRouter>);}
it('keeps an empty bell without general async navigation',async()=>{mount();const bell=await screen.findByRole('button',{name:'Notifications'});fireEvent.click(bell);expect(await screen.findByText('No notifications.')).toBeTruthy();expect(screen.queryByRole('link',{name:'My Async matches'})).toBeNull();expect(mocks.request).not.toHaveBeenCalled();});
it('keeps the pending bell visible and silent on entry, new revisions and read updates',async()=>{
 mocks.items=[notice];mount();const bell=await screen.findByRole('button',{name:/1 pending/});expect(bell.getAttribute('data-pending')).toBe('true');expect(bell.getAttribute('data-ring')).toBe('true');expect(mocks.request).not.toHaveBeenCalled();
 await act(async()=>mocks.changed());expect(mocks.request).not.toHaveBeenCalled();
 mocks.items=[{...notice,read_revision:1}];await act(async()=>mocks.changed());expect(mocks.request).not.toHaveBeenCalled();
 mocks.items=[{...notice,revision:2}];await act(async()=>mocks.changed());expect(mocks.request).not.toHaveBeenCalled();
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

it.each(['/delayed','/delayed/m','/delayed/m/play/c','/delayed/m?review=c','/game/session','/arcade','/arcade/tri-towers','/arcade/tri-towers/run/run-id','/profile'])('hides on direct %s entry while keeping updates',async path=>{mocks.items=[notice];mount(path);expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();await act(async()=>{});const before=mocks.rpc.mock.calls.length;await act(async()=>mocks.changed());expect(mocks.rpc.mock.calls.length).toBeGreaterThan(before);expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();});
it('identifies two turn matches by their recipient-specific opponent names',async()=>{
 mocks.items=['mcru81','Happach Gmail'].map((opponentName,index)=>({...notice,id:'notice-'+index,match_id:'match-'+index,payload:{...notice.payload,opponentName}}));
 mount();
 fireEvent.click(await screen.findByRole('button',{name:/pending/}));
 for(const name of ['mcru81','Happach Gmail'])expect(screen.getByText('vs '+name)).toBeTruthy();
 expect(screen.getAllByRole('button',{name:'YOUR TURN'})).toHaveLength(2);
});
function Navigation(){const navigate=useNavigate();return <><button onClick={()=>navigate('/delayed/m/play/c')}>Async</button><button onClick={()=>navigate('/')}>Main</button><NotificationBell/></>;}
it('keeps same-opponent matches separate and renders only the compact action and countdown',async()=>{
 const serverAt=Date.now();mocks.items=[28*3600000,42*60000].map((duration,i)=>({...notice,id:'same-'+i,match_id:'same-match-'+i,payload:{availableCount:i+1,opponentName:'mcru81',earliestDeadline:new Date(serverAt+duration).toISOString()}}));
 mocks.rpc.mockImplementation(async()=>({items:mocks.items,actionable:2,serverAt}));mount();fireEvent.click(await screen.findByRole('button',{name:/2 pending/}));
 expect(screen.getAllByRole('button',{name:'YOUR TURN'})).toHaveLength(2);expect(screen.getAllByText('vs mcru81')).toHaveLength(2);
 expect(screen.getByText('(28h left)')).toBeTruthy();expect(screen.getByText('(42m left)')).toBeTruthy();
 expect(screen.queryByText(/available turns|Earliest deadline|Your turn in an async/)).toBeNull();
 expect(document.querySelectorAll('.async-notification-list [data-match-id]')).toHaveLength(2);
});
it('uses the filtered server badge and refreshes deleted invitations from the owner signal',async()=>{
 mocks.items=[{...notice,kind:'invitation',payload:{opponentId:'inviter'}}];mount();fireEvent.click(await screen.findByRole('button',{name:/1 pending/}));
 mocks.items=[];await act(async()=>mocks.changed());expect(screen.getByRole('button',{name:'Notifications'})).toBeTruthy();expect(screen.getByText('No notifications.')).toBeTruthy();
});
function Path(){const location=useLocation();return <output data-testid="path">{location.pathname+location.search}</output>;}
it.each([['invitation','/delayed/m'],['results','/delayed/m'],['settled','/delayed/m?finale=1']])('preserves %s notification navigation',async(kind,destination)=>{
 mocks.items=[{...notice,kind,payload:{completionCount:2}}];
 render(<MemoryRouter><NotificationProvider><NotificationBell/><Path/></NotificationProvider></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:/1 pending/}));fireEvent.click(screen.getByRole('link'));
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe(destination));
});
it.each([1,2])('resolves %s actionable child turns using the existing notification path',async count=>{
 mocks.items=[{...notice,payload:{availableCount:count}}];
 mocks.rpc.mockImplementation(async name=>name==='delayed_home'?{id:'m',status:'active',held:false,serverAt:Date.now(),players:[{id:'user',name:'Me'},{id:'other',name:'Other'}],lineup:Array.from({length:count},(_,i)=>({id:'c'+i,actor:'user',terminal:false,expiresAt:new Date(Date.now()+3600000).toISOString()}))}:{items:mocks.items,actionable:1});
 render(<MemoryRouter><NotificationProvider><NotificationBell/><Path/></NotificationProvider></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:/1 pending/}));fireEvent.click(screen.getByRole('button',{name:'YOUR TURN'}));
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe(count===1?'/delayed/m/play/c0':'/delayed/m'));
});
it('silently preserves updates when leaving and returning to the main lobby',async()=>{mocks.items=[notice];render(<MemoryRouter><NotificationProvider><Navigation/></NotificationProvider></MemoryRouter>);await screen.findByRole('button',{name:/1 pending/});fireEvent.click(screen.getByRole('button',{name:'Async'}));expect(screen.queryByRole('button',{name:/Notifications/})).toBeNull();expect(mocks.request).not.toHaveBeenCalled();mocks.items=[notice,{...notice,id:'second'}];await act(async()=>mocks.changed());fireEvent.click(screen.getByRole('button',{name:'Main'}));expect(await screen.findByRole('button',{name:/2 pending/})).toBeTruthy();expect(mocks.request).not.toHaveBeenCalled();});

it('opens the same admin record from a registration bell and removes resolved approvals',async()=>{
 mocks.items=[{...notice,kind:'registration',match_id:null,registration_user_id:'22222222-2222-4222-8222-222222222222',payload:{username:'New player',email:'new@example.invalid'}}];
 render(<MemoryRouter><NotificationProvider><NotificationBell/><Path/></NotificationProvider></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:/1 pending/}));fireEvent.click(screen.getByRole('link',{name:/Approval required/}));
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe('/?adminPlayer=22222222-2222-4222-8222-222222222222'));
 mocks.items=[];await act(async()=>mocks.changed());expect(screen.queryByText(/Approval required/)).toBeNull();
});
