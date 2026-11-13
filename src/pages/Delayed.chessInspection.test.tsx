// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {installBrowserMedia} from '@/test/browserMedia';
import {newChess,playChess} from '@/lib/chess/rules';
const mock=vi.hoisted(()=>({rpc:vi.fn(),inspect:vi.fn(),play:vi.fn(),intent:vi.fn(),channel:vi.fn(),home:{} as any,snapshot:{} as any}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:'me'},isReady:true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:mock.channel,removeChannel:vi.fn()}}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc}));
vi.mock('@/lib/chess/client',async original=>({...await original<typeof import('@/lib/chess/client')>(),inspectAsyncChess:mock.inspect}));
vi.mock('@/hooks/useChess',()=>({useChess:mock.play}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/lib/chess/statusSound',()=>({preloadChessStatusSound:vi.fn(),chessStatusSound:vi.fn(()=>vi.fn()),chessHeartbeat:vi.fn(()=>vi.fn())}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children,actions,scores,panel,navigation}:any)=><div>{navigation}{scores}{children}{actions}{panel}</div>}));
import Delayed from './Delayed';
beforeEach(()=>{
 installBrowserMedia();sessionStorage.clear();localStorage.clear();vi.clearAllMocks();
 mock.channel.mockImplementation(()=>{const c={on:()=>c,subscribe:()=>c};return c;});
 const now=Date.now(),players=[{id:'me',userId:'me',name:'Alex',seat:1,isBot:false},{id:'other',userId:'other',name:'Blair',seat:2,isBot:false}];
 const start={...newChess({identity:{sessionId:'match',dealerGameId:'chess',roundId:'chess'},players,mode:'async',backgroundId:'photo'},now),opened:true};
 mock.snapshot={...playChess(start,'me',{type:'move',from:'e2',to:'e4'},now+1),revision:2,serverAt:now+1,viewerId:'me',canAct:false,paused:false,finished:false};
 mock.home={id:'match',status:'active',revision:2,realMoney:false,organizer:'me',opponent:'other',players,createdAt:new Date(now).toISOString(),acceptedAt:new Date(now).toISOString(),held:false,completed:0,net:0,exposure:5,serverAt:now,lineup:[{id:'chess',ordinal:1,game:'chess',stake:5,actor:'other',terminal:false,expiresAt:new Date(mock.snapshot.deadline).toISOString(),result:null}]};
 mock.rpc.mockImplementation(async()=>structuredClone(mock.home));mock.inspect.mockImplementation(async()=>structuredClone(mock.snapshot));
 mock.intent.mockResolvedValue(true);mock.play.mockImplementation(()=>({snapshot:mock.snapshot,now:mock.snapshot.serverAt,pending:false,connected:true,error:'',act:mock.intent,reconnect:vi.fn()}));
});
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});
function mount(){return render(<MemoryRouter initialEntries={['/delayed/match']}><Routes><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/></Routes></MemoryRouter>);}
it('opens the committed board passively and reenters the current own turn through Match Home',async()=>{
 const request='ptown:async-chess:1:me:chess';sessionStorage.setItem(request,'saved request');
 const {container}=mount();fireEvent.click(await screen.findByRole('link',{name:'View board'}));
 await screen.findByText("Opponent's Turn — View Only · Blair");
 expect(screen.getByRole('button',{name:'e4 White Pawn'})).toBeTruthy();
 expect(container.querySelectorAll('.chess-square:disabled')).toHaveLength(64);
 for(const button of screen.getAllByRole('button',{name:/Use time bank/})){expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(button);}
 fireEvent.click(screen.getByRole('button',{name:'g1 White Knight'}));
 expect(container.querySelector('[data-selected="true"]')).toBeNull();
 const reads=mock.rpc.mock.calls.length,channels=mock.channel.mock.calls.length;
 mock.snapshot={...mock.snapshot,...playChess({...mock.snapshot,opened:true},'other',{type:'move',from:'e7',to:'e5'},mock.snapshot.serverAt+1),revision:3,canAct:true,opened:true};
 mock.home={...mock.home,revision:3,lineup:[{...mock.home.lineup[0],actor:'me'}]};
 await act(async()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
 expect(mock.rpc).toHaveBeenCalledTimes(reads);expect(mock.channel).toHaveBeenCalledTimes(channels);expect(mock.inspect).toHaveBeenCalledOnce();
 expect(mock.play).not.toHaveBeenCalled();expect(mock.intent).not.toHaveBeenCalled();expect(sessionStorage.getItem(request)).toBe('saved request');
 expect(screen.getByRole('button',{name:'e7 Black Pawn'})).toBeTruthy();
 expect(localStorage.getItem('ptown:chess:seen:me:chess')).toBeNull();
 localStorage.setItem('ptown:chess:seen:me:chess','2');
 fireEvent.click(screen.getByRole('link',{name:'Match Home'}));fireEvent.click(await screen.findByRole('link',{name:'Take Turn'}));
 await waitFor(()=>expect(mock.play).toHaveBeenCalled());
 expect(screen.queryByText(/View Only/)).toBeNull();
 expect(container.querySelectorAll('.chess-square:disabled')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'g1 White Knight'}));
 expect(screen.getByRole('button',{name:'g1 White Knight'}).getAttribute('aria-pressed')).toBe('true');
});
it('uses inspected ownership when the lobby still claims it is your turn',async()=>{
 mock.home.lineup[0].actor='me';mount();fireEvent.click(await screen.findByRole('link',{name:'Take Turn'}));
 await screen.findByText("Opponent's Turn — View Only · Blair");expect(mock.play).not.toHaveBeenCalled();expect(mock.intent).not.toHaveBeenCalled();
});
