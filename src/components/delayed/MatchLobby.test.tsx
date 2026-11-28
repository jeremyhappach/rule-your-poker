// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import type {Home,ChildSummary} from '@/lib/delayed/client';
import {orderedLobbyGames,isReviewedGame} from '@/lib/delayed/lobbyPresentation';
const mock=vi.hoisted(()=>({rpc:vi.fn(),user:'me',home:null as any}));
vi.mock('@/hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:false,loading:false})}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:mock.user},isReady:true})}));
vi.mock('@/components/GameplaySoundButton',()=>({GameplaySoundButton:()=>null}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
import Delayed from '@/pages/Delayed';
import {installBrowserMedia} from '@/test/browserMedia';
const mount=()=>render(<MemoryRouter initialEntries={['/delayed/match']}><Routes><Route path='/delayed/:matchId' element={<Delayed/>}/></Routes></MemoryRouter>);
const flush=async()=>act(async()=>{await Promise.resolve();await Promise.resolve();});
it.each(['run21','tri-towers','quintzee','boxdrop','take-two','crib-lab','chucky-showdown','mega-card-golf'])('shows existing progress slots as completed rounds for new %s',async game=>{
 mock.home.policyVersion='delayed/sealed/1';mock.home.lineup=[{...mock.home.lineup[3],game,actor:'other',flowVersion:'delayed/sealed/1',playable:true,round:1,completedRounds:{me:0,other:1},pendingResults:{other:1}}];
 mount();await flush();expect(screen.getByText('0 rounds completed')).toBeTruthy();expect(screen.getByText('1 round completed')).toBeTruthy();expect(screen.getByRole('link',{name:'Play next round'})).toBeTruthy();expect(screen.getByText('Result sealed')).toBeTruthy();
});
it('shows waiting after a submission without admitting another round',async()=>{
 mock.home.policyVersion='delayed/sealed/1';mock.home.lineup=[{...mock.home.lineup[3],flowVersion:'delayed/sealed/1',playable:false,round:1,completedRounds:{me:1,other:0}}];
 mount();await flush();expect(screen.getByText('Waiting for opponent.')).toBeTruthy();expect(screen.queryByRole('link',{name:'Play next round'})).toBeNull();
});
it.each([false,true])('omits Chess numeric scores in active/completed cards (completed=%s)',async terminal=>{
 mock.home.lineup=[{...mock.home.lineup[0],game:'chess',terminal,viewed:terminal,scores:{me:0,other:0}}];
 const ui=mount();await flush();expect(ui.container.querySelector('.delayed-scoreboard')).toBeNull();
});
beforeEach(()=>{
 installBrowserMedia();localStorage.clear();sessionStorage.clear();
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
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.unstubAllGlobals();});
it.each(['me','other'])('active Words never exposes View Result during actor %s',async actor=>{
 const child=mock.home.lineup[1];Object.assign(child,{actor,scores:{me:250,other:195},pendingResults:{other:2},reviewCount:2});
 const ui=mount();await flush();const card=[...ui.container.querySelectorAll('.delayed-game-card')].find(c=>c.textContent?.includes('195'))!;
 expect(within(card as HTMLElement).queryByRole('link',{name:/View Result/i})).toBeNull();
 expect(card.textContent).toContain('195');expect(card.textContent).toContain('Pending');
 expect(within(card as HTMLElement).getByRole('link',{name:actor==='me'?'Take Turn':'View board'})).toBeTruthy();
 expect(mock.rpc.mock.calls.some(([name])=>name.includes('ack'))).toBe(false);
});
it('sorts presentation by actionability with stable ordinals and leaves canonical lineup intact',()=>{
 const h=mock.home as Home,original=h.lineup.map(c=>c.id);
 expect(orderedLobbyGames(h,'me',Date.now()).map(c=>c.id)).toEqual(['own','unreviewed','opponent','reviewed-win','reviewed-tie']);
 expect(h.lineup.map(c=>c.id)).toEqual(original);
 expect(orderedLobbyGames(h,'other',Date.now())[0].id).toBe('opponent');
 expect(orderedLobbyGames({...h,held:true},'me',Date.now())[0].id).toBe('unreviewed');
 expect(orderedLobbyGames(h,'me',Date.now()+200000)[0].id).toBe('unreviewed');
});
it('requires completion and this viewer final ACK independently of unread turns',()=>{
 const c=mock.home.lineup[0];
 expect(isReviewedGame({...c,terminal:false},'me')).toBe(false);
 expect(isReviewedGame({...c,viewed:undefined},'me')).toBe(false);
 expect(isReviewedGame({...c,viewed:false},'me')).toBe(false);
 expect(isReviewedGame({...c,pendingResults:{other:1}},'me')).toBe(true);
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
 expect(screen.getByRole('link',{name:'View Result'}).getAttribute('href')).toBe('/delayed/match?review=unreviewed');
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
 expect(screen.queryByRole('link',{name:'View Result'})).toBeNull();ui.unmount();
 // A separate authenticated viewer receives their independent server projection.
 mock.user='other';mock.home={...mock.home,lineup:mock.home.lineup.map((c:any)=>({...c,viewed:false,result:null}))};
 mount();await flush();expect(screen.queryByRole('button',{name:'Tri Towers L $2.5'})).toBeNull();expect(screen.getAllByRole('link',{name:'View Result'})).toHaveLength(3);
 expect(mock.rpc.mock.calls.some(([name])=>name.includes('ack'))).toBe(false);
});
