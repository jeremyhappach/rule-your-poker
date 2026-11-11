// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {installBrowserMedia} from '@/test/browserMedia';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
const mock=vi.hoisted(()=>({rpc:vi.fn(),words:vi.fn(),play:vi.fn(),intent:vi.fn(),channel:vi.fn(),home:{} as any,snapshot:{} as WordsSnapshot}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:'me'},isReady:true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:mock.channel,removeChannel:vi.fn()}}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc}));
vi.mock('@/lib/ptownWords/client',()=>({wordsRpc:mock.words}));
vi.mock('@/hooks/usePtownWords',()=>({usePtownWords:mock.play}));
vi.mock('@/lib/delayed/playingPresence',()=>({usePlayingPresence:()=>{},playingTopic:()=>null}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children,actions,scores,panel,navigation}:any)=><div>{navigation}{scores}{children}{actions}{panel}</div>}));
import Delayed from './Delayed';
beforeEach(()=>{
 installBrowserMedia();
 sessionStorage.clear();localStorage.clear();vi.clearAllMocks();
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 mock.channel.mockImplementation(()=>{const c={on:()=>c,subscribe:()=>c};return c;});
 const now=Date.now();
 mock.snapshot={identity:{sessionId:'match',dealerGameId:'words',roundId:'words'},revision:4,serverAt:now,rules:{version:'ptown-words/3',dictionaryId:'enable2k/1',dictionarySha256:'test',turnMs:129600000},players:[{id:'me',userId:'me',name:'Alex',seat:1,isBot:false},{id:'other',userId:'other',name:'Blair',seat:2,isBot:false}],viewerId:'me',activePlayerId:'other',board:Array(225).fill(null),rack:[{id:1,face:'C',value:3},{id:2,face:'?',value:0}],scores:{me:12,other:24},turn:4,deadline:now+129600000,canAct:false,paused:false,phase:'playing',bagCount:70,rackCounts:{me:2,other:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves:[],event:{label:'Word played',points:12}};
 mock.snapshot.board[112]={id:10,face:'A',letter:'A',value:1};
 mock.home={id:'match',status:'active',revision:4,realMoney:false,organizer:'me',opponent:'other',players:mock.snapshot.players,createdAt:new Date(now).toISOString(),acceptedAt:new Date(now).toISOString(),held:false,completed:0,net:0,exposure:5,serverAt:now,lineup:[{id:'words',ordinal:1,game:'ptown-words',stake:5,actor:'other',terminal:false,expiresAt:new Date(mock.snapshot.deadline).toISOString(),scores:mock.snapshot.scores,bagCount:70,result:null}]};
 mock.rpc.mockImplementation(async()=>structuredClone(mock.home));
 mock.words.mockImplementation(async()=>structuredClone(mock.snapshot));
 mock.intent.mockResolvedValue(true);
 mock.play.mockImplementation(()=>({snapshot:mock.snapshot,now:mock.snapshot.serverAt,pending:false,connected:true,error:'',errorVersion:0,act:mock.intent,reconnect:vi.fn()}));
});
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});
function mount(path='/delayed/match'){return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/></Routes></MemoryRouter>);}
it('opens the committed board and own rack without gameplay, pending-command replay or subscriptions; returning refreshes ownership',async()=>{
 const request='ptown:async-words:request:me:words';sessionStorage.setItem(request,JSON.stringify({requestId:'old',revision:1,intent:{type:'pass'}}));
 const {container}=mount();fireEvent.click(await screen.findByRole('link',{name:'View board'}));
 await screen.findByText("Opponent's Turn — View Only");
 expect(mock.words.mock.calls).toEqual([['delayed_words_inspect',{p_child:'words'}]]);expect(mock.play).not.toHaveBeenCalled();
 expect(screen.getAllByRole('gridcell')).toHaveLength(225);expect(screen.getByRole('gridcell',{name:'H8 A, 1 points'})).toBeTruthy();
 for(const name of ['C, 3 points','Blank, 0 points','Exchange','Pass']){const button=screen.getByRole('button',{name}) as HTMLButtonElement;expect(button.disabled).toBe(true);fireEvent.click(button);}
 expect(container.querySelectorAll('.words-rack button')).toHaveLength(2);expect(screen.getByText('24')).toBeTruthy();expect(screen.queryByRole('button',{name:'Submit Word'})).toBeNull();
 const viewport=container.querySelector('.words-viewport')!;
 fireEvent.keyDown(viewport,{key:'+'});expect(viewport.getAttribute('data-zoom')).toBe('1.25');
 fireEvent.click(screen.getByRole('button',{name:'Reset Zoom'}));expect(viewport.getAttribute('data-zoom')).toBe('1');
 const reads=mock.rpc.mock.calls.length,channels=mock.channel.mock.calls.length;
 mock.snapshot={...mock.snapshot,revision:5,turn:5,canAct:true,activePlayerId:'me',scores:{me:12,other:30}};
 mock.home={...mock.home,revision:5,lineup:[{...mock.home.lineup[0],actor:'me',scores:mock.snapshot.scores}]};
 await act(async()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
 expect(mock.rpc).toHaveBeenCalledTimes(reads);expect(mock.channel).toHaveBeenCalledTimes(channels);expect(mock.words).toHaveBeenCalledOnce();expect(mock.play).not.toHaveBeenCalled();expect(mock.intent).not.toHaveBeenCalled();expect(sessionStorage.getItem(request)).not.toBeNull();expect(screen.getByText('24')).toBeTruthy();
 fireEvent.click(screen.getAllByRole('link',{name:'Match Home'})[0]);
 fireEvent.click(await screen.findByRole('link',{name:'Take Turn'}));
 await waitFor(()=>expect(mock.play).toHaveBeenCalled());expect(screen.queryByText("Opponent's Turn — View Only")).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Pass'}));fireEvent.click(screen.getByRole('button',{name:'Pass turn'}));await waitFor(()=>expect(mock.intent).toHaveBeenCalledWith({type:'pass'}));
});
it('uses fresh snapshot ownership despite a stale active-turn lobby and never auto-navigates after the previous own word',async()=>{
 mock.home.lineup[0].actor='me';mock.snapshot.moves=[{turn:3,playerId:'me',action:'place',points:12,count:1,words:[{word:'A',points:12,square:112,direction:0}]}];
 mock.snapshot.movePresentation={version:1,turn:3,playerId:'me',squares:[112],startedAt:mock.snapshot.serverAt,announceAt:mock.snapshot.serverAt,readyAt:mock.snapshot.serverAt+10000,flipMs:100,focusMs:100,noticeMs:3600};
 mount();fireEvent.click(await screen.findByRole('link',{name:'Take Turn'}));await screen.findByText("Opponent's Turn — View Only");
 vi.useFakeTimers();await act(async()=>vi.advanceTimersByTime(40*3600000));expect(screen.getByText("Opponent's Turn — View Only")).toBeTruthy();expect(mock.words).toHaveBeenCalledOnce();expect(mock.play).not.toHaveBeenCalled();
});
it('fails closed on the wrong participant identity and supports an explicit read retry',async()=>{
 mock.words.mockResolvedValueOnce({...mock.snapshot,viewerId:'other'});
 mount('/delayed/match/play/words');await screen.findByText('Match identity mismatch.');expect(screen.queryByRole('grid')).toBeNull();expect(mock.play).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText("Opponent's Turn — View Only");expect(mock.words).toHaveBeenCalledTimes(2);
});
it('does not add opponent-turn access to other games or change completed/invited access',async()=>{
 mock.home.lineup[0].game='run21';const ui=mount();await screen.findByText('Opponent’s turn');expect(screen.queryByRole('link',{name:'View board'})).toBeNull();ui.unmount();
 mock.home.lineup[0].game='ptown-words';mock.home.status='invited';mount();await screen.findByText('Waiting for acceptance');expect(screen.queryByRole('link',{name:'View board'})).toBeNull();
});
