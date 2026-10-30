// @vitest-environment jsdom
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
const transport=vi.hoisted(()=>({rpc:vi.fn(),changed:()=>{},status:(_:string)=>{}}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:'me'},isReady:true})}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:transport.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:(_e:any,_f:any,cb:()=>void)=>{transport.changed=cb;return c;},subscribe:(cb:(s:string)=>void)=>{transport.status=cb;return c;}};return c;},removeChannel:vi.fn()}}));
import Delayed from './Delayed';
const home=(revision=1,actor='other',terminal=false)=>({id:'match',status:terminal?'settled':'active',revision,realMoney:false,organizer:'me',opponent:'other',players:[{id:'me',name:'Alex'},{id:'other',name:'Blair'}],acceptedAt:new Date().toISOString(),held:false,completed:terminal?1:0,net:0,exposure:5,serverAt:Date.now(),lineup:[{id:'child',ordinal:1,game:'run21',stake:5,actor,revision,terminal,expiresAt:new Date(Date.now()+3600000).toISOString(),scores:{me:0,other:null},result:null}]});
function Path(){return <output>{useLocation().pathname}</output>;}
function mount(){return render(<MemoryRouter initialEntries={['/delayed/match']}><Path/><Routes><Route path='/delayed/:matchId' element={<Delayed/>}/></Routes></MemoryRouter>);}
beforeEach(()=>{transport.rpc.mockReset();transport.rpc.mockResolvedValue(home());});afterEach(cleanup);
it('waits for a server projection, then changes cards without navigation or revealing a pending score',async()=>{
 mount();await screen.findByText('Opponent’s turn');expect(screen.queryByText('Take Turn')).toBeNull();
 transport.rpc.mockResolvedValue(home(2,'me'));await act(async()=>transport.changed());expect(await screen.findByText('Take Turn')).toBeTruthy();expect(screen.getByText('/delayed/match')).toBeTruthy();expect(document.querySelector('[data-pending="true"]')?.textContent).toBe('—');
 transport.rpc.mockResolvedValue(home(3,'me',true));await act(async()=>transport.changed());expect(screen.queryByText('Take Turn')).toBeNull();expect(screen.getByText('/delayed/match')).toBeTruthy();
});
it('rejects delayed responses and recovers a missed completion on reconnect',async()=>{
 mount();await screen.findByText('Opponent’s turn');let old!:(v:any)=>void;transport.rpc.mockImplementationOnce(()=>new Promise(r=>old=r)).mockResolvedValue(home(3,'me'));
 act(()=>transport.changed());await act(async()=>transport.changed());await screen.findByText('Take Turn');await act(async()=>old(home(2,'other')));expect(screen.getByText('Take Turn')).toBeTruthy();
 transport.rpc.mockResolvedValue(home(4,'me',true));await act(async()=>transport.status('SUBSCRIBED'));await waitFor(()=>expect(screen.queryByText('Take Turn')).toBeNull());
});
it('restores the current allowed projection on foreground/online without a polling loop',async()=>{
 mount();await screen.findByText('Opponent’s turn');transport.rpc.mockResolvedValue(home(2,'me'));await act(async()=>window.dispatchEvent(new Event('online')));expect(await screen.findByText('Take Turn')).toBeTruthy();
 transport.rpc.mockResolvedValue(home(3,'other'));await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(await screen.findByText('Opponent’s turn')).toBeTruthy();
});
