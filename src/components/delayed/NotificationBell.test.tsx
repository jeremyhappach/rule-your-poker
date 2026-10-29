// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
const mocks=vi.hoisted(()=>({request:vi.fn(()=>()=>{}),items:[] as any[],changed:()=>{},rpc:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:mocks.request}}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:mocks.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>{const c={on:(_a:any,_b:any,changed:()=>void)=>{mocks.changed=changed;return c;},subscribe:()=>c};return c;},removeChannel(){}}}));
import {NotificationProvider,NotificationBell} from './NotificationBell';
const notice={id:'n',match_id:'m',kind:'turn',revision:1,read_revision:0,actionable:true,payload:{availableCount:1,lastCall:false}};
beforeEach(()=>{sessionStorage.clear();mocks.items=[];mocks.request.mockClear();mocks.rpc.mockImplementation(async()=>({items:mocks.items,actionable:mocks.items.length}));});afterEach(cleanup);
function mount(path='/delayed'){return render(<MemoryRouter initialEntries={[path]}><NotificationProvider><NotificationBell/></NotificationProvider></MemoryRouter>);}
it('keeps match access in the empty bell',async()=>{mount();const bell=await screen.findByRole('button',{name:'Notifications'});fireEvent.click(bell);expect(await screen.findByRole('link',{name:'My Async matches'})).not.toBeNull();expect(mocks.request).not.toHaveBeenCalled();});
it('sounds for new pending revisions in the lobby, never unchanged refresh/read updates',async()=>{
 mocks.items=[notice];mount();await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(1));expect(screen.getByRole('button',{name:/Notifications/}).getAttribute('data-pending')).toBe('true');
 await act(async()=>mocks.changed());expect(mocks.request).toHaveBeenCalledTimes(1);
 mocks.items=[{...notice,read_revision:1}];await act(async()=>mocks.changed());expect(mocks.request).toHaveBeenCalledTimes(1);
 mocks.items=[{...notice,revision:2}];await act(async()=>mocks.changed());expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('does not ring or sound at the game table',async()=>{mocks.items=[notice];mount('/delayed/m/play/c');await screen.findByRole('button',{name:/1 pending/});expect(mocks.request).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:/Notifications/}).hasAttribute('data-ring')).toBe(false);});
