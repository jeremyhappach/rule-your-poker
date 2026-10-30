vi.mock('@/lib/delayed/playingPresence',()=>({playingTopic:()=>'',usePlayingPresence:()=>false}));
// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {DelayedTurn} from './DelayedTurn';
import baseRules from '@/lib/triTowers/rules-v2.json';

const mock=vi.hoisted(()=>({snapshot:null as any,change:null as null|((p:any)=>void),request:vi.fn(),audio:vi.fn(()=>vi.fn())}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:mock.request,DelayedRequestError:class extends Error{},gameName:()=> 'TriTowers'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const channel={on:(_e:any,_f:any,cb:any)=>{mock.change=cb;return channel;},subscribe:()=>channel};return channel;},removeChannel:vi.fn()}}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children,navigation}:any)=><main>{navigation}{children}</main>}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:mock.audio}}));
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=> <span/>}));
globalThis.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
const rules={...baseRules,version:'tri-towers/5',holdMs:5000,roundIntroMs:2500,clearCelebrationMs:3000};
const completedAt=10000,deadline=18000;
const board={rules,phase:'playing',cards:Array.from({length:28},(_,i)=>i),removed:Array.from({length:27},(_,i)=>i),waste:1,stockRemaining:6,run:7,highRun:9,score:39200,deadline:68000};
const rawResult={score:45780,scoreBefore:0,stageScore:45780,timeBonus:580,stockBonus:6000,reason:'cleared',completedAt};
const initial=()=>({id:'child',matchId:'match',game:'tri-towers',config:rules,revision:47,segment:1,actor:'me',round:1,board,totals:{me:0,other:0},terminal:false,held:false,expiresAt:new Date(129600000).toISOString(),serverAt:9900,ownResults:[],winner:null,result:null});
const finish=()=>({...initial(),revision:48,segment:2,actor:'other',board:null,serverAt:completedAt,ownResults:[{round:1,score:45780,at:completedAt,result:rawResult,board:{...board,phase:'stage_complete',removed:Array.from({length:28},(_,i)=>i),score:45780,deadline,result:rawResult}}]});
function mount(){return render(<MemoryRouter initialEntries={['/turn']}><Routes><Route path="/turn" element={<DelayedTurn childId="child" matchId="match" userId="me"/>}/><Route path="/delayed/match" element={<div>Match destination</div>}/></Routes></MemoryRouter>);}
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve();});}
async function receive(value:any){mock.snapshot=value;await act(async()=>{mock.change?.({new:{match_id:'match'}});await Promise.resolve();await Promise.resolve();});}
async function tick(ms:number){await act(async()=>{vi.advanceTimersByTime(ms);});}
beforeEach(()=>{vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout','Date','performance']});vi.clearAllMocks();mock.snapshot=initial();mock.request.mockImplementation(async()=>structuredClone(mock.snapshot));Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('async TriTowers attempt completion',()=>{
 it('keeps the round identity, celebrates and counts the authoritative score before returning',async()=>{
  const ui=mount();await flush();const key=ui.container.querySelector('[data-round-key]')?.getAttribute('data-round-key');
  await receive(finish());
  expect(ui.container.querySelector('[data-round-key]')?.getAttribute('data-round-key')).toBe(key);
  expect(ui.getByLabelText('All three towers cleared')).toBeTruthy();expect(ui.getByLabelText('You score 0')).toBeTruthy();
  await tick(5600);expect(ui.getByLabelText('You score 22890')).toBeTruthy();
  await tick(1700);expect(ui.getByLabelText('You score 45780')).toBeTruthy();expect(ui.queryByText('Match destination')).toBeNull();
  await tick(2999);expect(ui.queryByText('Match destination')).toBeNull();await tick(101);expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.request.mock.calls.every(([body])=>body.op==='state')).toBe(true);
 });
 it('does not restart the sequence or replay audio for a duplicate result',async()=>{
  const ui=mount();await flush();await receive(finish());await tick(5000);
  await receive(finish());await tick(6000);
  expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.audio.mock.calls.filter(([event]:any)=>event.id.startsWith('tri-clear:'))).toHaveLength(1);
 });
 it('returns directly on fresh reentry into the completed attempt',async()=>{
  mock.snapshot=finish();const ui=mount();await flush();expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.audio.mock.calls.filter(([event]:any)=>event.id.startsWith('tri-clear:'))).toHaveLength(0);
 });
 it('returns after an overdue completion recovered by the mounted route',async()=>{
  const ui=mount();await flush();await receive({...finish(),serverAt:deadline+1});await tick(3000);
  expect(ui.getByText('Match destination')).toBeTruthy();
 });
 it('keeps the completed attempt when a later round arrives',async()=>{
  const ui=mount();await flush();await receive(finish());await tick(5000);
  const next=finish();await receive({...next,revision:52,segment:4,round:2,serverAt:15000,
   ownResults:[...next.ownResults,{...next.ownResults[0],round:2,at:15000,score:99999}]});
  expect(ui.container.querySelector('[data-round-key]')?.getAttribute('data-round-key')).toBe('child:1');
  expect(ui.container.querySelector('[data-stage-result]')?.getAttribute('data-stage-result')).toBe('child:me:1:10000');
  await tick(6000);expect(ui.getByText('Match destination')).toBeTruthy();
 });
 it('presents a terminal child result before returning',async()=>{
  const ui=mount();await flush();await receive({...finish(),terminal:true});
  expect(ui.getByLabelText('All three towers cleared')).toBeTruthy();await tick(11000);expect(ui.getByText('Match destination')).toBeTruthy();
 });
 it('returns immediately for a forfeit without a completed attempt',async()=>{
  const ui=mount();await flush();await receive({...finish(),terminal:true,ownResults:[]});expect(ui.getByText('Match destination')).toBeTruthy();
 });
});
