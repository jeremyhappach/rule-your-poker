// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {finalWordsFixture,viewer,opponent,childId,matchId} from '@/lib/delayed/wordsFinalReview.fixture';
import {wordsFinalReview} from '@/lib/delayed/wordsFinalReview';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/components/GameplaySoundButton',()=>({GameplaySoundButton:()=>null}));
vi.mock('canvas-confetti',()=>({default:vi.fn()}));
import {ChildResults} from './ResultReview';
let fixture:ReturnType<typeof finalWordsFixture>,failAck='',elapsed=0;
function Path(){return <output data-testid="path">{useLocation().search}</output>;}
const mount=()=>render(<TooltipProvider><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/review']}><Path/><Routes><Route path='/review' element={<ChildResults childId={childId} matchId={matchId} userId={viewer}/>}/><Route path={'/delayed/'+matchId} element={<h1>Destination</h1>}/></Routes></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider>);
const advance=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
const flush=async()=>act(async()=>{await Promise.resolve();await Promise.resolve();});
const acks=()=>mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_ack').map(c=>c[1].p_event);
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);sessionStorage.clear();fixture=finalWordsFixture();failAck='';elapsed=0;
 Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}});global.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
 mock.rpc.mockReset();mock.rpc.mockImplementation(async(name,args)=>{
  if(name==='delayed_home')return {...fixture.home,reviewsComplete:!!fixture.home.receipt&&fixture.events.every(e=>e.seen)};
  if(name==='delayed_reviews')return {events:structuredClone(fixture.events),terminal:true};
  if(name==='delayed_words_inspect')return structuredClone(fixture.snapshot);
  if(name==='delayed_review_begin')return {elapsed,seen:fixture.events.find(e=>e.id===args.p_event)?.seen};
  if(name==='delayed_review_ack'){if(args.p_event===failAck)throw Error('lost');fixture.events.find(e=>e.id===args.p_event)!.seen=true;return;}
  throw Error('Unexpected RPC '+name);
 });
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it.each([false,true])('only final turn and crosses → count → adjusted board hold → game → match=%s',async matchEnds=>{
 fixture=finalWordsFixture(matchEnds);const ui=mount();await flush();
 expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_begin').map(c=>c[1].p_event)).toEqual(['turn-5']);
 expect(ui.container.querySelector('[data-square="10"] b')?.textContent).toBe('D');
 expect(ui.container.querySelector('[data-square="113"] b')).toBeNull();
 expect(ui.container.querySelectorAll('[data-word-highlight="true"]')).toHaveLength(3);
 expect(screen.getByText(/UP, PA/)).toBeTruthy();expect(screen.queryByText(/OLD|DOG/)).toBeNull();
 const score=()=>ui.container.querySelector(`[data-score-player="${opponent}"] strong`)?.textContent;
 expect(score()).toBe('376');await advance(2450);expect(Number(score())).toBeGreaterThan(376);expect(Number(score())).toBeLessThan(384);
 await advance(250);expect(score()).toBe('384');await advance(2000);expect(score()).toBe('385');
 expect(ui.container.querySelector(`[data-score-player="${viewer}"] strong`)?.textContent).toBe('245');
 expect(screen.getByText('Opponent wins')).toBeTruthy();
 expect(ui.container.querySelector('.words-scroll')?.getAttribute('data-zoom')).toBe('0');expect(acks()).toEqual([]);
 await advance(2999);expect(screen.queryByText('Game Complete')).toBeNull();expect(acks()).toEqual([]);
 await advance(101);expect(screen.getByText('Game Complete')).toBeTruthy();expect(acks()).toEqual(['turn-1','turn-3','turn-5']);
 await advance(6100);expect(acks()).toEqual(['turn-1','turn-3','turn-5','child-result']);expect(screen.getByTestId('path').textContent).toBe(matchEnds?'?finale=1':'');
});
it('partial acknowledgement failure cannot announce completion; retry is idempotent and never replays history',async()=>{
 failAck='turn-3';mount();await flush();await advance(7800);expect(screen.getByRole('alert')).toBeTruthy();expect(fixture.events[0].seen).toBe(true);expect(screen.queryByText('Game Complete')).toBeNull();
 failAck='';fireEvent.click(screen.getByRole('button',{name:'Retry'}));await flush();expect(screen.getByText('Game Complete')).toBeTruthy();expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_begin')).toHaveLength(1);
});
it('reload after partial acknowledgement resumes only the final turn and retains a full final-board hold',async()=>{
 fixture.events[0].seen=true;elapsed=60000;const ui=mount();await flush();expect(screen.getByText(/UP, PA/)).toBeTruthy();expect(ui.container.querySelector(`[data-score-player="${opponent}"] strong`)?.textContent).toBe('385');
 await advance(2999);expect(acks()).toEqual([]);await advance(101);expect(acks()).toEqual(['turn-3','turn-5']);
});
it('an already-viewed final turn cannot send an older pending word back into playback',async()=>{
 fixture.events[2].seen=true;mount();await flush();expect(screen.getByText(/UP, PA/)).toBeTruthy();await advance(7800);
 expect(acks()).toEqual(['turn-1','turn-3']);expect(screen.getByText('Game Complete')).toBeTruthy();
 expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_begin').map(c=>c[1].p_event)).toEqual(['turn-5']);
});
it('offline or background review cannot acknowledge results early',async()=>{
 mount();await flush();Object.defineProperty(document,'hidden',{configurable:true,value:true});await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await advance(20000);expect(acks()).toEqual([]);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await advance(7800);expect(screen.getByText('Game Complete')).toBeTruthy();
});
it.each(['own','pass','forfeit'])('%s finish retains final scores without reviving an older opponent word',async reason=>{
 if(reason==='own'){fixture.snapshot.moves.at(-1)!.playerId=viewer;fixture.snapshot.movePresentation!.playerId=viewer;}
 else if(reason==='pass')fixture.snapshot.moves.push({turn:6,playerId:opponent,action:'pass',points:0,count:0,words:[]});
 else fixture.events.at(-1)!.receipt.reason='timeout_forfeit';
 const ui=mount();await flush();expect(screen.getByText('Final board')).toBeTruthy();expect(ui.container.querySelectorAll('[data-word-highlight="true"]')).toHaveLength(0);await advance(3100);expect(screen.getByText('Game Complete')).toBeTruthy();
});
it('reduced motion still shows final adjusted totals for three seconds',async()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:true});const ui=mount();await flush();expect(ui.container.querySelector(`[data-score-player="${opponent}"] strong`)?.textContent).toBe('385');await advance(2999);expect(acks()).toEqual([]);await advance(101);expect(screen.getByText('Game Complete')).toBeTruthy();
});
it('rejects foreign identity and does not mutate the saved snapshot/history',()=>{
 const before=structuredClone(fixture);const result=wordsFinalReview(fixture.events,fixture.snapshot,childId,matchId,viewer);expect(result.event.board.moves).toHaveLength(1);expect(fixture).toEqual(before);
 expect(()=>wordsFinalReview(fixture.events,fixture.snapshot,childId,'wrong',viewer)).toThrow();
});
