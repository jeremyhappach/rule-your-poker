// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import type {Home,ChildSummary} from '@/lib/delayed/client';
import {orderedLobbyGames,isReviewedGame} from '@/lib/delayed/lobbyPresentation';
const mock=vi.hoisted(()=>({rpc:vi.fn(),user:'me',home:null as any}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:mock.user},isReady:true})}));
vi.mock('@/components/GameplaySoundButton',()=>({GameplaySoundButton:()=>null}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
import Delayed from '@/pages/Delayed';
const mount=()=>render(<MemoryRouter initialEntries={['/delayed/match']}><Routes><Route path='/delayed/:matchId' element={<Delayed/>}/></Routes></MemoryRouter>);
const flush=async()=>act(async()=>{await Promise.resolve();await Promise.resolve();});
beforeEach(()=>{
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 mock.user='me';mock.rpc.mockReset();
 const child=(id:string,ordinal:number,patch:Partial<ChildSummary>)=>({id,ordinal,game:'run21',stake:99,actor:'other',terminal:false,expiresAt:new Date(Date.now()+100000).toISOString(),scores:{me:50,other:40},...patch});
 mock.home={id:'match',status:'active',revision:1,organizer:'other',realMoney:true,players:[{id:'me',name:'Hap'},{id:'other',name:'mcru81'}],net:-8,unsettled:14,exposure:27,completed:3,serverAt:Date.now(),acceptedAt:new Date().toISOString(),lineup:[
  child('reviewed-win',1,{terminal:true,viewed:true,game:'run21',result:{winner:'me',delta:3,reason:'normal',at:''}}),
  child('opponent',2,{game:'ptown-words'}),
  child('unreviewed',3,{terminal:true,viewed:false,game:'tri-towers',result:null}),
  child('own',4,{actor:'me',game:'boxdrop'}),
  child('reviewed-tie',5,{terminal:true,viewed:true,game:'quintzee',result:{winner:null,delta:0,reason:'normal',at:''}})
 ]};
 mock.rpc.mockImplementation(async(name)=>name==='delayed_home'?mock.home:name==='notification_preferences'?{}:false);
});
afterEach(cleanup);
it('sorts presentation by actionability with stable ordinals and leaves canonical lineup intact',()=>{
 const h=mock.home as Home,original=h.lineup.map(c=>c.id);
 expect(orderedLobbyGames(h,'me',Date.now()).map(c=>c.id)).toEqual(['own','unreviewed','opponent','reviewed-win','reviewed-tie']);
 expect(h.lineup.map(c=>c.id)).toEqual(original);
 expect(orderedLobbyGames(h,'other',Date.now())[0].id).toBe('opponent');
 expect(orderedLobbyGames({...h,held:true},'me',Date.now())[0].id).toBe('unreviewed');
 expect(orderedLobbyGames(h,'me',Date.now()+200000)[0].id).toBe('unreviewed');
});
it('requires explicit completion and this viewer ACK plus no unseen opponent attempts',()=>{
 const c=mock.home.lineup[0];
 expect(isReviewedGame({...c,terminal:false},'me')).toBe(false);
 expect(isReviewedGame({...c,viewed:undefined},'me')).toBe(false);
 expect(isReviewedGame({...c,viewed:false},'me')).toBe(false);
 expect(isReviewedGame({...c,pendingResults:{other:1}},'me')).toBe(false);
 expect(isReviewedGame({...c,pendingResults:{me:1}},'me')).toBe(true);
});
it('shows compact metadata, dynamic dialog and no numbering; opening lobby does not ACK',async()=>{
 const ui=mount();await flush();
 expect(ui.container.querySelector('.async-brand-ordinal')).toBeNull();expect(screen.queryByText('HEAD-TO-HEAD')).toBeNull();
 const info=screen.getByRole('region',{name:'Match Info'});expect(info.querySelector('.async-current-net-player')?.textContent).toBe('Hap−$8');
 expect(within(info).getByText('$14 unsettled')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Match information'}));
 const dialog=screen.getByRole('dialog');expect(within(dialog).getByText('Real Money')).toBeTruthy();expect(within(dialog).getByText('3/5 Complete')).toBeTruthy();expect(within(dialog).getByText('$27')).toBeTruthy();
 fireEvent.click(within(dialog).getByRole('button',{name:'Done'}));expect(screen.queryByRole('dialog')).toBeNull();
 expect(mock.rpc.mock.calls.some(([name])=>name.includes('ack'))).toBe(false);
});
it('keeps review prominent, uses actual delta, expands one at a time and resets on reentry',async()=>{
 let ui=mount();await flush();
 expect(screen.getByRole('link',{name:'View Results'}).getAttribute('href')).toBe('/delayed/match?review=unreviewed');
 const win=screen.getByRole('button',{name:/Run 21.*W.*\$3/}),tie=screen.getByRole('button',{name:/Quintzee.*T.*\$0/});
 expect(win.getAttribute('aria-expanded')).toBe('false');expect(win.querySelector('.delayed-win')).toBeTruthy();
 fireEvent.click(win);expect(win.getAttribute('aria-expanded')).toBe('true');
 expect(document.getElementById(win.getAttribute('aria-controls')!)?.hidden).toBe(false);
 fireEvent.click(tie);expect(win.getAttribute('aria-expanded')).toBe('false');expect(tie.getAttribute('aria-expanded')).toBe('true');
 fireEvent.click(tie);expect(tie.getAttribute('aria-expanded')).toBe('false');fireEvent.click(win);
 ui.unmount();ui=mount();await flush();expect(screen.getByRole('button',{name:/Run 21.*W.*\$3/}).getAttribute('aria-expanded')).toBe('false');
});
it.each([true,false])('refresh uses persisted viewer projection and actual loss in money mode %s',async realMoney=>{
 mock.home.realMoney=realMoney;const ui=mount();await flush();
 mock.home={...mock.home,revision:2,lineup:mock.home.lineup.map((c:any)=>c.id==='unreviewed'?{...c,viewed:true,result:{winner:'other',delta:-2.5,reason:'normal',at:''}}:c)};
 await act(async()=>window.dispatchEvent(new Event('online')));await flush();
 const loss=screen.getByRole('button',{name:/Tri Towers.*L.*\$2.5/});expect(loss.querySelector('.delayed-loss')).toBeTruthy();
 expect(screen.queryByRole('link',{name:'View Results'})).toBeNull();ui.unmount();
 // A separate authenticated viewer receives their independent server projection.
 mock.user='other';mock.home={...mock.home,lineup:mock.home.lineup.map((c:any)=>({...c,viewed:false,result:null}))};
 mount();await flush();expect(screen.queryByRole('button',{name:'Tri Towers L $2.5'})).toBeNull();expect(screen.getAllByRole('link',{name:'View Results'})).toHaveLength(3);
 expect(mock.rpc.mock.calls.some(([name])=>name.includes('ack'))).toBe(false);
});
