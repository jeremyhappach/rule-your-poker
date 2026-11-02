// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {RUN21_RULES} from '@/lib/run21/rulesets';
import {emptyBoard, startBoardClock, presentBoardCard, moveBoardCard} from '@/lib/run21/board';
import {loadAuditionedFixtures} from '@/lib/audio/approvedSounds.fixture';
import {approvedSound} from '@/lib/audio/approvedSounds';
import triRules from '@/lib/triTowers/rules-v2.json';
import {DelayedTurn} from './DelayedTurn';
const mocks=vi.hoisted(()=>({value:null as any,request:vi.fn(),change:null as any,
  requestAudio:vi.fn((_event:any)=>vi.fn()),follow:vi.fn((_event:any)=>vi.fn()),present:vi.fn()}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:mocks.request,DelayedRequestError:class extends Error{},gameName:(s:string)=>s}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:(_e:any,_f:any,cb:any)=>{mocks.change=cb;return c;},subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('@/lib/delayed/playingPresence',()=>({usePlayingPresence:()=>{},roundGameplayRunning:()=>false,playingTopic:()=>null}));
vi.mock('@/components/GameplaySoundButton',()=>({GameplaySoundButton:()=>null}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:mocks.requestAudio,follow:mocks.follow,present:mocks.present,getSnapshot:()=>({userId:'me',enabled:true})}}));
const now=10000;
function snapshot(game='run21',started=false):any {
 const rules=game==='run21'?RUN21_RULES:game==='tri-towers'?{...triRules,version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000}:{version:'boxdrop/1',stageMs:100000,introMs:2500,holdMs:8000};
 let board:any=null;
 if(started&&game==='run21'){board=emptyBoard('me',RUN21_RULES);startBoardClock(board,RUN21_RULES,0);presentBoardCard(board,[{rank:'2',suit:'spades'}]);}
 if(started&&game==='tri-towers')board={rules,phase:'playing',cards:Array.from({length:28},(_,i)=>i>=18?i%13:null),removed:[],waste:4,stockRemaining:12,run:0,highRun:0,score:0,deadline:now+120000};
 if(started&&game==='boxdrop')board={rules,phase:'playing',scales:Array.from({length:4},()=>({stage:1,target:32,limit:6,sum:0,status:'active',boxes:[]})),current:{id:1,value:4,color:'red',recycled:false},queue:[],recycleIndicator:0,recycleStreak:0,completedFirstOrders:0,closures:0,score:0,deadline:now+100000,result:null,event:{label:'Playing',points:0}};
 return {id:'child',matchId:'match',game,config:rules,revision:1,segment:1,actor:'me',round:1,board,totals:{me:0,other:0},terminal:false,held:false,expiresAt:new Date(now+129600000).toISOString(),serverAt:now,ownResults:[],winner:null,result:null};
}
function acceptCommand(c:any){
 if(c.op==='action'){
  const v=structuredClone(mocks.value);v.revision++;v.serverAt=Date.now();
  if(c.intent.type==='start'){
   v.board=snapshot(v.game,true).board;
   if(v.game==='run21'){v.board=emptyBoard('me',RUN21_RULES);startBoardClock(v.board,RUN21_RULES,Date.now());presentBoardCard(v.board,[{rank:'2',suit:'spades'}]);}
   else {v.board.phase='intro';v.board.deadline=Date.now()+2500;}
  }else {moveBoardCard(v.board,RUN21_RULES,c.intent,Date.now());v.board.revision++;v.board.current={rank:'3',suit:'hearts'};}
  mocks.value=v;
 }
 return structuredClone(mocks.value);
}
function mount(autoStart=false){return render(<TooltipProvider><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/turn']}><Routes><Route path="/turn" element={<DelayedTurn childId="child" matchId="match" userId="me" autoStart={autoStart}/>}/><Route path="/delayed/match" element={<p>Match home</p>}/></Routes></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider>);}
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve();});}
async function step(ms:number){await act(async()=>vi.advanceTimersByTime(ms));}
const placements=()=>mocks.follow.mock.calls.filter(([e]:any)=>e.id.startsWith('run21-swoosh:'));
const bells=()=>[...mocks.follow.mock.calls,...mocks.requestAudio.mock.calls].filter(([e]:any)=>e.id.startsWith('run21-bell:'));
async function place(){fireEvent.click(screen.getByRole('button',{name:/Place in column 1,/}));await flush();}
async function refresh(){await act(async()=>mocks.change?.({new:{match_id:'match'}}));await flush();}
beforeEach(async()=>{
 await loadAuditionedFixtures();vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout','Date','performance']});vi.setSystemTime(now);vi.clearAllMocks();sessionStorage.clear();
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
 mocks.value=snapshot();mocks.request.mockImplementation(async c=>acceptCommand(c));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it.each(['run21','tri-towers','boxdrop'])('%s rings once for an accepted new start, including later segments',async game=>{
 mocks.value={...snapshot(game),segment:3,round:2};mount(true);await flush();expect(bells()).toHaveLength(1);
 await refresh();await step(100);expect(bells()).toHaveLength(1);
});
it.each(['run21','tri-towers','boxdrop'])('%s does not ring for rehydrated intro or already-playing boards',async game=>{
 mocks.value=snapshot(game,true);if(game==='run21')startBoardClock(mocks.value.board,RUN21_RULES,now);else {mocks.value.board.phase='intro';mocks.value.board.deadline=now+2500;}
 const ui=mount(true);await flush();expect(bells()).toHaveLength(0);ui.unmount();
 mocks.value=snapshot(game,true);mount(true);await flush();expect(bells()).toHaveLength(0);
});
it('first new placement and pass after reopening sound at confirmation, with duplicate state reads silent',async()=>{
 mocks.value=snapshot('run21',true);mount();await flush();expect(placements()).toHaveLength(0);
 await place();expect(placements()).toHaveLength(1);expect((placements()[0][0] as any).cueAt()).toBe(approvedSound('slide'));
 await refresh();await step(100);expect(placements()).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Pass'}));await flush();expect(placements()).toHaveLength(2);expect((placements()[1][0] as any).cueAt().schedule).toBe(approvedSound('flip')?.schedule);
});
it('a new action after offline recovery sounds even before the state read returns',async()=>{
 mocks.value=snapshot('run21',true);mount();await flush();
 await act(async()=>window.dispatchEvent(new Event('offline')));
 const original=mocks.request.getMockImplementation()!;mocks.request.mockImplementation(c=>c.op==='state'?new Promise(()=>{}):original(c));
 await act(async()=>window.dispatchEvent(new Event('online')));await place();expect(placements()).toHaveLength(1);
});
it('a recovered command is silent, then the next newly performed placement sounds',async()=>{
 mocks.value=snapshot('run21',true);sessionStorage.setItem('ptown:async-turn:request:me:child',JSON.stringify({op:'action',childId:'child',revision:1,segment:1,requestId:'restored',intent:{type:'place',column:0}}));
 mount();await flush();expect(placements()).toHaveLength(0);await place();expect(placements()).toHaveLength(1);
});
it('retains a legitimate new start after an earlier interruption before the board mounted',async()=>{
 mount();await flush();await act(async()=>window.dispatchEvent(new Event('offline')));
 fireEvent.click(screen.getByRole('button',{name:'Begin round 1'}));await flush();expect(bells()).toHaveLength(1);
});
it('never sounds an old Start replayed from storage',async()=>{
 sessionStorage.setItem('ptown:async-turn:request:me:child',JSON.stringify({op:'action',childId:'child',revision:1,segment:1,requestId:'restored',intent:{type:'start'}}));
 mount();await flush();expect(bells()).toHaveLength(0);
});
it('does not sound rejected actions or their later retry, but the next fresh action works',async()=>{
 mocks.value=snapshot('run21',true);mount();await flush();mocks.request.mockRejectedValueOnce(Error('lost response'));await place();expect(placements()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Reconnect'}));await flush();expect(placements()).toHaveLength(0);await place();expect(placements()).toHaveLength(1);
});
it('retires an in-flight placement when hidden without swallowing the next fresh one',async()=>{
 mocks.value=snapshot('run21',true);mount();await flush();let reply!:()=>void;
 mocks.request.mockImplementationOnce(c=>new Promise(resolve=>{reply=()=>resolve(acceptCommand(c));}));await place();expect(placements()).toHaveLength(0);
 await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));reply();});
 await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await flush();expect(placements()).toHaveLength(0);
 await place();expect(placements()).toHaveLength(1);
});
it('a state read from a second client cannot produce a placement sound',async()=>{
 mocks.value=snapshot('run21',true);mount();await flush();acceptCommand({op:'action',intent:{type:'place',column:0}});await refresh();expect(placements()).toHaveLength(0);
 await place();expect(placements()).toHaveLength(1);
});
