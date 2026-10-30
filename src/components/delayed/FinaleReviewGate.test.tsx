// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
const mock=vi.hoisted(()=>({rpc:vi.fn(),events:{} as Record<string,any[]>,finaleSeen:false,failAck:'',failRefresh:false,revision:1}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:'me'},isReady:true})}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/lib/delayed/client',async original=>({...await original<typeof import('@/lib/delayed/client')>(),delayedRpc:mock.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('canvas-confetti',()=>({default:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:vi.fn(()=>vi.fn()),follow:vi.fn(()=>vi.fn())}}));
import Delayed from '@/pages/Delayed';
import {AsyncHistory} from './AsyncHistory';
function home(){
 return {id:'match',status:'settled',revision:mock.revision,organizer:'me',opponent:'other',realMoney:false,
  players:[{id:'me',name:'Owner'},{id:'other',name:'Opponent'}],net:-3,receipt:{match_id:'match'},completed:3,exposure:7,unsettled:0,
  serverAt:Date.now(),createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),finaleViewed:mock.finaleSeen,
  reviewsComplete:Object.values(mock.events).flat().every(e=>e.seen),
  lineup:['run','tri','quint'].map((id,i)=>({id,ordinal:i+1,game:['run21','tri-towers','quintzee'][i],stake:[1,5,1][i],terminal:true,
   viewed:mock.events[id].find(e=>e.kind==='child').seen,pendingResults:{other:mock.events[id].filter(e=>e.kind==='attempt'&&!e.seen).length},
   scores:{me:100,other:mock.events[id].every(e=>e.seen)?90:null},result:mock.events[id].find(e=>e.kind==='child').seen?{winner:i===1?'other':'me',delta:i===1?-5:1}:null}))};
}
function Path(){const l=useLocation();return <output data-testid="path">{l.pathname+l.search}</output>;}
const mount=(path='/delayed/match')=>render(<TooltipProvider><ResponsiveGeometryProvider><MemoryRouter initialEntries={[path]}><Path/><Routes>
 <Route path='/delayed/:matchId' element={<Delayed/>}/><Route path='/archive' element={<AsyncHistory viewerName='Owner'/>}/><Route path='/' element={<h1>Lobby</h1>}/>
 </Routes></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider>);
const flush=async()=>act(async()=>{await Promise.resolve();await Promise.resolve();});
const advance=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
const acks=()=>mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_ack').map(c=>c[1].p_event);
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T19:05:00Z'));mock.finaleSeen=false;mock.failAck='';mock.failRefresh=false;mock.revision=1;
 Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}});global.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
 mock.events=Object.fromEntries(['run','tri','quint'].map((id,i)=>[id,[
  {id:id+'-attempt',kind:'attempt',actor:'other',actorName:'Opponent',round:3,score:23100,at:new Date().toISOString(),receipt:{game:['run21','tri-towers','quintzee'][i]},board:null,seen:i===2},
  {id:id+'-child',kind:'child',actor:null,round:0,receipt:{winner:i===1?'other':'me'},seen:i===2}]]));
 mock.rpc.mockReset();mock.rpc.mockImplementation(async(name,args)=>{
  if(name==='delayed_home'||name==='delayed_history_detail'){if(mock.failRefresh)throw Error('refresh failed');return home();}
  if(name==='delayed_reviews')return {events:structuredClone(mock.events[args.p_child]),terminal:true};
  if(name==='delayed_review_begin')return {elapsed:0,seen:false};
  if(name==='delayed_review_ack'){if(mock.failAck===args.p_event)throw Error('ACK failed');Object.values(mock.events).flat().find(e=>e.id===args.p_event)!.seen=true;mock.revision++;return;}
  if(name==='delayed_finale_ack'){if(!home().reviewsComplete)throw Error('delayed:reviews_pending');mock.finaleSeen=true;return;}
  if(name==='delayed_history')return [{id:'match',opponent:'Opponent',count:3,net:-3,completedAt:new Date().toISOString()}];
  throw Error('Unexpected RPC '+name);
 });
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('reproduces three children: selected Tri replay precedes home, final Run replay precedes finale',async()=>{
 mount();await flush();expect(screen.getAllByRole('link',{name:'View Results'})).toHaveLength(2);
 fireEvent.click(screen.getAllByRole('link',{name:'View Results'})[1]);await flush();
 expect(screen.getByText("Showing Opponent's results")).toBeTruthy();expect(screen.queryByRole('img',{name:/wins the match/})).toBeNull();
 await advance(16000);await advance(6100);expect(acks()).toEqual(['tri-attempt','tri-child']);
 expect(screen.getByTestId('path').textContent).toBe('/delayed/match');expect(screen.getAllByRole('link',{name:'View Results'})).toHaveLength(1);
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_finale_ack')).toBe(false);
 fireEvent.click(screen.getByRole('link',{name:'View Results'}));await flush();await advance(16000);await advance(6100);
 expect(acks()).toEqual(['tri-attempt','tri-child','run-attempt','run-child']);
 expect(screen.getByTestId('path').textContent).toBe('/delayed/match?finale=1');fireEvent.load(screen.getByRole('img',{name:'Opponent wins the match'}));await advance(7600);
 expect(mock.finaleSeen).toBe(true);expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_finale_ack')).toHaveLength(1);
});
it.each([false,true])('direct finale/reload blocks outstanding reviews despite old finale ACK=%s',async oldAck=>{
 mock.finaleSeen=oldAck;const ui=mount('/delayed/match?finale=1');await flush();
 expect(screen.getByTestId('path').textContent).toBe('/delayed/match');expect(screen.getAllByRole('link',{name:'View Results'})).toHaveLength(2);ui.unmount();
 mount('/delayed/match?finale=1');await flush();await advance(15000);expect(screen.queryByRole('img',{name:/wins the match/})).toBeNull();expect(acks()).toEqual([]);
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_finale_ack')).toBe(false);
});
it('archive See Results routes through the same guard',async()=>{
 mount('/archive');await flush();fireEvent.click(screen.getByRole('link',{name:'See Results'}));await flush();
 expect(screen.getByTestId('path').textContent).toBe('/delayed/match');expect(screen.getAllByRole('link',{name:'View Results'})).toHaveLength(2);
});
it('finished query cannot skip unseen attempts even if the child and finale were previously acknowledged',async()=>{
 mock.finaleSeen=true;mock.events.run[1].seen=true;mount('/delayed/match?review=run&finished=1');await flush();
 expect(screen.getByText("Showing Opponent's results")).toBeTruthy();expect(screen.queryByText('Game Complete')).toBeNull();await advance(16000);expect(acks()).toEqual(['run-attempt']);
});
it('a pending attempt retains View Results when its child ACK already exists',async()=>{
 mock.events.run[1].seen=true;mount();await flush();expect(screen.getAllByRole('link',{name:'View Results'})).toHaveLength(2);
 expect(screen.queryByRole('link',{name:'Replay match finale'})).toBeNull();
});
it.each(['tri-attempt','tri-child'])('failed %s ACK cannot trigger finale; reload retries the remaining review',async event=>{
 mock.failAck=event;const ui=mount('/delayed/match?review=tri');await flush();await advance(16000);await advance(6100);expect(screen.getByRole('alert')).toBeTruthy();
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_finale_ack')).toBe(false);ui.unmount();mock.failAck='';mount('/delayed/match?review=tri');await flush();await advance(16000);await advance(6100);
 expect(screen.getByTestId('path').textContent).toBe('/delayed/match');expect(mock.events.run[0].seen).toBe(false);
});
it('failed post-ACK refresh stays out of finale until fresh authoritative state is restored',async()=>{
 mount('/delayed/match?review=tri');await flush();await advance(16000);mock.failRefresh=true;await advance(6100);
 expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByTestId('path').textContent).toContain('?review=tri');expect(mock.finaleSeen).toBe(false);
});
it('refresh after ACK observes another tab completing the remaining child',async()=>{
 mount('/delayed/match?review=tri');await flush();await advance(16000);
 mock.events.run.forEach(e=>e.seen=true);mock.revision++;await advance(6100);
 expect(screen.getByTestId('path').textContent).toBe('/delayed/match?finale=1');expect(screen.getByRole('img',{name:'Opponent wins the match'})).toBeTruthy();
});
it('missing server qualification fails closed',async()=>{
 const rpc=mock.rpc.getMockImplementation()!;mock.rpc.mockImplementation((name,args)=>name==='delayed_history_detail'?Promise.resolve({...home(),reviewsComplete:undefined}):rpc(name,args));
 mount('/delayed/match?finale=1');await flush();expect(screen.getByTestId('path').textContent).toBe('/delayed/match');expect(mock.finaleSeen).toBe(false);
});
