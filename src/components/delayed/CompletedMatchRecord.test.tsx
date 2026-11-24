// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {recordFixture,recordGames} from '@/lib/delayed/matchRecord.fixture';
import {matchRecordPath} from '@/lib/delayed/matchRecord';
import {gameName} from '@/lib/delayed/client';
import {installBrowserMedia} from '@/test/browserMedia';
const mock=vi.hoisted(()=>({rpc:vi.fn(),request:vi.fn(),celebrate:vi.fn(),mounted:vi.fn()}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:'me'},isReady:true})}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc,delayedRequest:mock.request}));
vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:mock.celebrate}));
vi.mock('@/components/delayed/ResultReview',()=>({MatchFinale:()=>{mock.mounted('finale');return null;},ChildResults:()=>{mock.mounted('review');return null;},ReviewGate:()=>{mock.mounted('gate');return null;}}));
vi.mock('@/components/fiveAlive/FiveAliveSession',()=>({FiveAliveSession:()=>{mock.mounted('five-alive');return null;}}));
vi.mock('@/components/delayed/DelayedTurn',()=>({DelayedTurn:()=>{mock.mounted('turn');return null;}}));
vi.mock('@/components/delayed/ChessTurn',()=>({ChessTurn:()=>{mock.mounted('chess');return null;}}));
vi.mock('@/components/delayed/WordsTurn',()=>({WordsTurn:()=>{mock.mounted('words');return null;}}));
import Delayed from '@/pages/Delayed';
import {AsyncHistory} from './AsyncHistory';
const Path=()=>{const location=useLocation();return <output data-testid="path">{location.pathname+location.search}</output>;};
function mount(path='/delayed/match?history=1'){
 return render(<MemoryRouter initialEntries={[path]}><Path/><Routes>
  <Route path="/" element={<AsyncHistory viewerName="Hap"/>}/>
  <Route path="/delayed" element={<h1>Async lobby</h1>}/>
  <Route path="/delayed/:matchId" element={<Delayed/>}/>
  <Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/>
 </Routes></MemoryRouter>);
}
beforeEach(()=>{
 installBrowserMedia();vi.clearAllMocks();
 mock.rpc.mockImplementation(async(name,args)=>name==='delayed_history'?[{id:'match',opponent:'Opponent',count:11,net:5,completedAt:'2026-11-17',startedAt:'2026-11-17',realMoney:false}]:name==='delayed_match_record'?recordFixture(args.p_child??undefined):Promise.reject(Error('Unexpected RPC '+name)));
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('returns completed Async records to the Async lobby',async()=>{
 mount();await screen.findByRole('list',{name:'Completed match games'});fireEvent.click(screen.getByRole('link',{name:'← Async lobby'}));
 expect(screen.getByRole('heading',{name:'Async lobby'})).toBeTruthy();expect(screen.getByTestId('path').textContent).toBe('/delayed');
});
it('opens completed history into the full lineup, details and back without live owners',async()=>{
 mount('/');fireEvent.click(await screen.findByRole('link',{name:'See Results'}));
 await screen.findByRole('list',{name:'Completed match games'});
 expect(screen.getAllByLabelText('Final game scores')).toHaveLength(11);
 fireEvent.click(screen.getByRole('link',{name:'View completed Quintzee'}));
 await screen.findByText('Quintzee scores by round');
 fireEvent.click(screen.getByRole('link',{name:'← Match record'}));
 await screen.findByRole('list',{name:'Completed match games'});
 expect(mock.rpc.mock.calls.every(([name])=>['delayed_history','delayed_match_record'].includes(name))).toBe(true);
 expect(mock.request).not.toHaveBeenCalled();expect(mock.mounted).not.toHaveBeenCalled();expect(mock.celebrate).not.toHaveBeenCalled();
});
it.each(recordGames)('opens and reloads the completed %s detail without actions',async game=>{
 let view=mount(matchRecordPath('match',game));await screen.findByRole('region',{name:gameName(game)+' completed record'});
 if(game==='chucky-showdown')expect(screen.getAllByText('Q♦')).toHaveLength(4);
 expect(screen.queryByText(/Take Turn|Resume turn|Replay match finale|View match results/)).toBeNull();
 expect(view.container.querySelector('.async-boxing,.async-confetti,.async-winner-overlay,.async-finale')).toBeNull();
 view.unmount();view=mount(matchRecordPath('match',game));await screen.findByRole('region',{name:gameName(game)+' completed record'});
 expect(mock.rpc.mock.calls.every(([name])=>name==='delayed_match_record')).toBe(true);
 expect(mock.request).not.toHaveBeenCalled();expect(mock.mounted).not.toHaveBeenCalled();expect(mock.celebrate).not.toHaveBeenCalled();
});
it('shows final Chess position and checkmate',async()=>{
 mount(matchRecordPath('match','chess'));
 const board=await screen.findByRole('img',{name:'Saved final Chess board'});
 expect(board.querySelector('[data-history-square="g7"]')?.getAttribute('aria-label')).toBe('g7 White Queen');
 expect(screen.getByText(/checkmate/i)).toBeTruthy();
});
it('shows every word scoring field for both players, including exact canonical awards',async()=>{
 mount(matchRecordPath('match','five-alive'));
 expect(await screen.findByText('Base score 1,000 × multiplier 1.4 = final score 1,400')).toBeTruthy();
 expect(screen.getByText('Base score 700 × multiplier 1.4 = final score 980')).toBeTruthy();
 expect(screen.getAllByText('Word 1: APPLE')).toHaveLength(2);
 expect(screen.getByText('Hard · 1 guess')).toBeTruthy();expect(screen.getByText('Hard · 2 guesses')).toBeTruthy();
});
it('renders redacted opponent history as gray placeholders without losing the final score',async()=>{
 const value=recordFixture('five-alive');
 const opponent=value.detail!.words!.rounds[1][0];
 opponent.guesses[0]={word:'',feedback:[]};
 mock.rpc.mockResolvedValue(value);mount(matchRecordPath('match','five-alive'));
 expect(await screen.findByLabelText('Hidden opponent guess')).toBeTruthy();
 expect(screen.getAllByLabelText('Hidden letter')).toHaveLength(5);
 expect(screen.getByText('Base score 700 × multiplier 1.4 = final score 980')).toBeTruthy();
 expect(screen.getAllByText('Word 1: APPLE')).toHaveLength(2);
 expect(mock.request).not.toHaveBeenCalled();
});
it.each(['run21','tri-towers','quintzee'] as const)('%s shows both players by round and detailed breakdowns',async game=>{
 mount(matchRecordPath('match',game));const table=await screen.findByRole('table',{name:gameName(game)+' scores by round'});
 const rows=within(table).getAllByRole('row');expect(rows).toHaveLength(3);
 expect(rows[1].textContent).toBe('1784490');expect(rows[2].textContent).toBe('27840');
 fireEvent.click(screen.getByText('Hap · Round 1 · 784 points'));
 if(game==='quintzee'){expect(screen.getAllByText('Upper bonus')).toHaveLength(4);expect(screen.getAllByText('Category scores')).toHaveLength(4);expect(screen.getAllByText('Category subtotal')).toHaveLength(4);}
});
it('shows Words board, scored words and rack adjustments',async()=>{
 mount(matchRecordPath('match','ptown-words'));await screen.findByRole('img',{name:'Saved final Words board'});
 expect(screen.getByText('AXE (24)')).toBeTruthy();expect(screen.getByText('Hap: before adjustments 25 · rack deduction 1 · final 24')).toBeTruthy();
});
it('history takes precedence over review/finale/play route parameters',async()=>{
 mount('/delayed/match/play/chess?history=1&review=chess&finale=1');
 await screen.findByRole('img',{name:'Saved final Chess board'});expect(mock.mounted).not.toHaveBeenCalled();
});
it('rejects incomplete and mismatched records without falling through to gameplay',async()=>{
 mock.rpc.mockResolvedValue({...recordFixture(),home:{...recordFixture().home,status:'active'}});
 mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByRole('list',{name:'Completed match games'})).toBeNull();expect(mock.mounted).not.toHaveBeenCalled();
});
it.each(['foreign','wrong-child','wrong-game'])('rejects %s record identity',async kind=>{
 const value=recordFixture('quintzee');
 if(kind==='foreign')value.home.organizer='outsider';
 if(kind==='wrong-child')value.detail!.id='another';
 if(kind==='wrong-game')value.detail!.game='run21';
 mock.rpc.mockResolvedValue(value);mount(matchRecordPath('match','quintzee'));
 expect(await screen.findByRole('alert')).toBeTruthy();expect(mock.mounted).not.toHaveBeenCalled();
});
it('labels unplayed and forfeited word rounds without inventing an award',async()=>{
 const value=recordFixture('five-alive');value.detail!.words!.rounds[0][0].completed=false;
 value.detail!.words!.rounds[0][0].guesses=[];
 mock.rpc.mockResolvedValue(value);mount(matchRecordPath('match','five-alive'));
 expect(await screen.findByText('Not played')).toBeTruthy();
 expect(screen.queryByText('Base score 1,000 × multiplier 1.4 = final score 1,400')).toBeNull();
});
it('retains round scores when old board details are missing',async()=>{
 const value=recordFixture('run21');value.detail!.attempts[0].board=null;
 mock.rpc.mockResolvedValue(value);mount(matchRecordPath('match','run21'));
 await screen.findByText('Run 21 scores by round');fireEvent.click(screen.getByText('Hap · Round 1 · 784 points'));
 expect(screen.getByText('Saved board details unavailable.')).toBeTruthy();
});
it('remains static after time passes and does not acknowledge old unviewed results',async()=>{
 vi.useFakeTimers();mount();
 await act(async()=>{await Promise.resolve();await Promise.resolve();});
 await act(async()=>vi.advanceTimersByTime(60000));
 expect(mock.rpc).toHaveBeenCalledTimes(1);expect(mock.request).not.toHaveBeenCalled();expect(mock.celebrate).not.toHaveBeenCalled();expect(mock.mounted).not.toHaveBeenCalled();
});
