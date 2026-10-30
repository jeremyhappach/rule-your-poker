vi.mock('@/lib/delayed/playingPresence',()=>({playingTopic:()=>'',usePlayingPresence:()=>false}));
// @vitest-environment jsdom
// Actual async shell: these cases reproduced the sibling defects before correction.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {RUN21_RULES} from '@/lib/run21/rulesets';
import {DelayedTurn} from './DelayedTurn';
import {WordsTurn} from './WordsTurn';
const mock=vi.hoisted(()=>({snapshot:null as any,change:null as any,request:vi.fn(),words:vi.fn(),audio:vi.fn(()=>vi.fn())}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:mock.request,delayedRpc:vi.fn(),DelayedRequestError:class extends Error{},gameName:(s:string)=>s,signed:String}));
vi.mock('@/lib/ptownWords/client',()=>({wordsRpc:mock.words}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:(_e:any,_f:any,cb:any)=>{mock.change=cb;return c;},subscribe:(cb:any)=>{cb?.('SUBSCRIBED');return c;}};return c;},removeChannel:vi.fn()}}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:mock.audio,request:mock.audio}}));
const quintRules={version:'quintzee/3',durationMs:180000,resultMs:5000,clearBonus:35,upperThreshold:63,upperBonus:35,bonusThreshold:80000,rounds:2,maxRounds:3,introMs:2500,speedMin:100,speedRange:200};
function board(game:string):any{
 if(game==='run21')return {playerId:'me',columns:Array.from({length:5},()=>[{rank:'10',suit:'spades'}]),passesUsed:0,presented:[],current:{rank:'A',suit:'spades'},cardIndex:0,revision:1,startedAt:0,deadline:120000,result:null};
 if(game==='quintzee')return {rules:quintRules,phase:'playing',deadline:180000,dice:[2,2,3,4,5],held:[],rollsRemaining:2,rollSerial:1,scores:{twos:4},potentials:{chance:16},scoreBefore:0,score:0,baseScore:4,result:null};
 return {rules:{version:'boxdrop/1',stageMs:100000,introMs:2500,holdMs:8000},phase:'playing',scales:Array.from({length:4},()=>({stage:1,target:32,limit:6,sum:0,status:'active',boxes:[]})),current:{id:1,value:4,color:'red',recycled:false},queue:[],recycleIndicator:0,recycleStreak:0,completedFirstOrders:0,closures:0,highScore:0,score:0,deadline:110000,result:null,event:{label:'Playing',points:0}};
}
function initial(game:string):any{return {id:'child',matchId:'match',game,config:game==='run21'?RUN21_RULES:board(game).rules,revision:1,segment:1,actor:'me',round:1,board:board(game),totals:{me:0,other:0},terminal:false,held:false,expiresAt:new Date(129600000).toISOString(),serverAt:1000,ownResults:[],winner:null,result:null};}
function finish(game:string,reason:string):any{
 const v=initial(game),b=v.board,result=game==='run21'?{reason,at:2000,aggregate:100,totals:[20,20,20,20,20],aceElevations:[],multiplier:200,speed:100,score:20000}:game==='quintzee'?{reason,categorySubtotal:100,upperSubtotal:50,upperBonus:0,clearBonus:0,rawSubtotal:100,multiplier:100,remainingMs:0,stageScore:10000,scoreBefore:0,score:10000,completedAt:2000}:{reason,score:10000,scoreBefore:0,displayScore:10000,stageScore:10000,firstOrderPoints:5000,closurePoints:2000,partialPoints:0,speedBonus:3000,recyclingBonus:0,bonusEligible:false,completedFirstOrders:4,remainingMs:0,completedAt:2000};
 if(game==='run21'&&['timeout','bust'].includes(reason))result.score=0;
 return {...v,revision:2,segment:2,actor:'other',board:null,serverAt:2000,totals:{me:result.score,other:0},ownResults:[{round:1,score:result.score,at:2000,result,board:{...b,phase:'stage_complete',score:result.score,deadline:game==='quintzee'?7000:10000,result}}]};
}
function words():any{return {identity:{sessionId:'match',dealerGameId:'child',roundId:'round'},revision:1,serverAt:1000,rules:{version:'ptown-words/2',dictionaryId:'enable2k/1',dictionarySha256:'hash',turnMs:129600000},players:[{id:'me',userId:'me',name:'You',seat:1,isBot:false},{id:'other',userId:'other',name:'Other',seat:2,isBot:false}],viewerId:'me',activePlayerId:'me',board:Array(225).fill(null),rack:[{id:1,face:'C',value:3},{id:2,face:'A',value:1}],scores:{me:0,other:0},turn:1,deadline:129600000,canAct:true,paused:false,phase:'playing',bagCount:86,rackCounts:{me:2,other:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{me:0,other:0},resultId:null,batch:null},moves:[],event:{label:'Started',points:0}};}
function wordFinish(){const v=words();return {...v,revision:2,serverAt:2000,turn:2,canAct:false,activePlayerId:'other',scores:{me:4,other:0},moves:[{turn:1,playerId:'me',action:'place',points:4,count:2,words:[{word:'CA',points:4}]}],movePresentation:{version:1,turn:1,playerId:'me',squares:[112,113],startedAt:2000,announceAt:2000,readyAt:5600,flipMs:100,focusMs:0,noticeMs:3600}};}
function mount(wordsMode=false,autoStart=false){return render(<TooltipProvider><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/turn']}><Routes><Route path="/turn" element={wordsMode?<WordsTurn childId="child" matchId="match" userId="me"/>:<DelayedTurn childId="child" matchId="match" userId="me" autoStart={autoStart}/>}/><Route path="/delayed/match" element={<h1>Match destination</h1>}/></Routes></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider>);}
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();});}
async function receive(v:any){mock.snapshot=v;await act(async()=>{mock.change?.({new:{match_id:'match'}});await Promise.resolve();await Promise.resolve();});}
async function tick(ms:number){await act(async()=>{vi.advanceTimersByTime(ms);});}
beforeEach(()=>{vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout','Date','performance']});vi.clearAllMocks();sessionStorage.clear();
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});
 mock.request.mockImplementation(async()=>structuredClone(mock.snapshot));mock.words.mockImplementation(async()=>structuredClone(mock.snapshot));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('actual async shell sibling audit',()=>{
 for(const [game,reasons] of [['run21',['collect','exhausted','bust','timeout']],['quintzee',['all_categories','no_matches','timeout']],['boxdrop',['full_clear','take_score','timeout']]] as const){
  for(const reason of reasons)it(`${game} ${reason}: presents the saved result then returns`,async()=>{
   mock.snapshot=initial(game);const ui=mount();await flush();expect(ui.container.querySelector('[data-fullscreen-game-shell]')).toBeTruthy();
   await receive(finish(game,reason));await tick(20000);
   expect(ui.getByText('Match destination')).toBeTruthy();
   expect(mock.request.mock.calls.every(([body])=>body.op==='state')).toBe(true);
  });
  it(`${game}: late terminal result returns without sending actions`,async()=>{
   mock.snapshot=initial(game);const ui=mount();await flush();const v={...finish(game,reasons[0]),terminal:true,serverAt:20000};
   await receive(v);await tick(2999);expect(ui.queryByText('Match destination')).toBeNull();await tick(101);expect(ui.getByText('Match destination')).toBeTruthy();
   expect(mock.request.mock.calls.every(([body])=>body.op==='state')).toBe(true);
  });
  it(`${game}: fresh completed reentry and forfeit without attempt return`,async()=>{
   mock.snapshot=finish(game,reasons[0]);let ui=mount();await flush();expect(ui.getByText('Match destination')).toBeTruthy();ui.unmount();
   mock.snapshot=initial(game);ui=mount();await flush();await receive({...finish(game,reasons[0]),terminal:true,ownResults:[]});expect(ui.getByText('Match destination')).toBeTruthy();
   expect(mock.request.mock.calls.every(([body])=>body.op==='state')).toBe(true);
  });
  it(`${game}: old duplicate does not restart the result window`,async()=>{
   mock.snapshot=initial(game);const ui=mount();await flush();await receive(finish(game,reasons[0]));await tick(4000);
   await receive(finish(game,reasons[0]));await tick((game==='boxdrop'?4000:1000)+3000);expect(ui.getByText('Match destination')).toBeTruthy();
  });
  it(`${game}: retains this attempt through later rounds and terminal child completion`,async()=>{
   mock.snapshot=initial(game);const ui=mount();await flush();const v=finish(game,reasons[0]);await receive(v);
   await receive({...v,terminal:true,revision:4,segment:4,round:2,ownResults:[...v.ownResults,{...v.ownResults[0],round:2,score:99999,at:3000}]});
   expect(ui.queryByText('Match destination')).toBeNull();await tick(20000);expect(ui.getByText('Match destination')).toBeTruthy();
  });
  it(`${game}: lost accepted reply retries the same request before returning`,async()=>{
   mock.snapshot=initial(game);const ui=mount();await flush();let attempts=0;
   mock.request.mockImplementation(async(body:any)=>{if(body.op==='action'){mock.snapshot=finish(game,reasons[0]);if(++attempts===1)throw Error('Reply lost');}return structuredClone(mock.snapshot);});
   const name=game==='run21'?/Give Up/:game==='quintzee'?'Any: unfilled':'Take Score';
   fireEvent.click(ui.getByRole('button',{name}));await flush();fireEvent.click(ui.getByRole('button',{name:'Reconnect'}));await flush();await tick(20000);
   expect(ui.getByText('Match destination')).toBeTruthy();const calls=mock.request.mock.calls.filter(([body])=>body.op==='action');expect(calls).toHaveLength(2);expect(calls[1][0]).toEqual(calls[0][0]);
  });
 }
 for(const aggregate of [104,105])it(`Run21 ${aggregate}: shared medal, score count-up and return`,async()=>{
  mock.snapshot=initial('run21');const ui=mount();await flush();const v=finish('run21','collect');v.ownResults[0].board.result.aggregate=aggregate;
  await receive(v);expect(ui.getByText(aggregate===105?'PERFECT 105!':'INCREDIBLE 104!')).toBeTruthy();
  await receive(v);await tick(aggregate===105?3800:3000);expect(ui.queryByText(aggregate===105?'PERFECT 105!':'INCREDIBLE 104!')).toBeNull();
  await tick(2500);expect(ui.container.querySelector('.async-score-pills [data-active=true] strong')?.textContent).toBe('10,000');await tick(2500);expect(ui.queryByText('Match destination')).toBeNull();await tick(3000);expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.audio.mock.calls.filter(([event]:any)=>event.id.startsWith('run21-fanfare:'))).toHaveLength(1);
 });
 for(const game of ['quintzee','boxdrop'])it(`${game}: canonical count-up starts from the prior total`,async()=>{
  mock.snapshot=initial(game);const ui=mount();await flush();await receive(finish(game,game==='quintzee'?'timeout':'take_score'));
  expect(ui.getByLabelText('You score 0')).toBeTruthy();await tick(2600);
  expect(ui.getByLabelText('You score 5000')).toBeTruthy();
  expect(ui.queryByText('Saving…')).toBeNull();expect(ui.queryByText('Placing…')).toBeNull();
 });
 it('Words: own word receipt counts then returns through actual async shell',async()=>{
  mock.snapshot=words();const ui=mount(true);await flush();expect(ui.container.querySelector('[data-fullscreen-game-shell]')).toBeTruthy();
  await receive(wordFinish());expect(ui.queryByText('Match destination')).toBeNull();await tick(7000);expect(ui.queryByText('Match destination')).toBeNull();await tick(3000);expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.words.mock.calls.every(([name])=>name==='delayed_words_snapshot')).toBe(true);
 });
 it('Words: duplicate and late receipt return without an action replay',async()=>{
  mock.snapshot=words();const ui=mount(true);await flush();await receive(wordFinish());await receive({...wordFinish(),serverAt:20000});await tick(100);expect(ui.queryByText('Match destination')).toBeNull();await tick(3000);
  expect(ui.getByText('Match destination')).toBeTruthy();expect(mock.words.mock.calls.every(([name])=>name==='delayed_words_snapshot')).toBe(true);
 });
 it('Words: fresh terminal and timeout-forfeit reentry returns',async()=>{
  mock.snapshot={...wordFinish(),finished:true,phase:'complete',outcome:{reason:'timeout_forfeit',winner:'other',delta:-5}};
  const ui=mount(true);await flush();expect(ui.getByText('Match destination')).toBeTruthy();expect(mock.words.mock.calls.every(([name])=>name==='delayed_words_snapshot')).toBe(true);
 });
 it('Words: submitted winning word retains its count-up before final child return',async()=>{
  mock.snapshot=words();const ui=mount(true);await flush();
  fireEvent.click(ui.container.querySelector('[data-square="112"]')!);fireEvent.click(ui.container.querySelector('[data-square="112"]')!);
  mock.words.mockImplementation(async(name:string)=>{if(name==='delayed_words_action')mock.snapshot={...wordFinish(),phase:'complete',finished:true,outcome:{reason:'completed',winner:'me',delta:5}};return structuredClone(mock.snapshot);});
  fireEvent.click(ui.getByRole('button',{name:'C, 3 points'}));fireEvent.click(ui.container.querySelector('[data-square="112"]')!);
  fireEvent.click(ui.getByRole('button',{name:'A, 1 points'}));fireEvent.click(ui.container.querySelector('[data-square="113"]')!);
  fireEvent.click(ui.getByRole('button',{name:'Submit Word'}));await flush();expect(ui.queryByText('Match destination')).toBeNull();await tick(7000);expect(ui.queryByText('Match destination')).toBeNull();await tick(3000);expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.words.mock.calls.filter(([name])=>name==='delayed_words_action')).toHaveLength(1);
 });
 it('Words: pass returns after the accepted action',async()=>{
  mock.snapshot=words();const ui=mount(true);await flush();
  mock.words.mockImplementation(async(name:string)=>{if(name==='delayed_words_action')mock.snapshot={...words(),revision:2,turn:2,canAct:false,activePlayerId:'other'};return structuredClone(mock.snapshot);});
  fireEvent.click(ui.getByRole('button',{name:/^Pass$/}));fireEvent.click(ui.getByRole('button',{name:'Pass turn'}));await flush();expect(ui.getByText('Match destination')).toBeTruthy();
  expect(mock.words.mock.calls.filter(([name])=>name==='delayed_words_action')).toHaveLength(1);
 });
});

it('accepts a second-device ACK at the same gameplay revision but rejects a gameplay conflict',async()=>{
 mock.snapshot={...initial('run21'),reviewRevision:0,pendingResults:{me:0,other:1}};const ui=mount();await flush();
 await receive({...mock.snapshot,reviewRevision:1,pendingResults:{me:0,other:0},totals:{me:0,other:125}});expect(ui.queryByRole('alert')).toBeNull();
 await receive({...mock.snapshot,board:{...mock.snapshot.board,cardIndex:9}});expect(ui.getByRole('alert').textContent).toContain('Conflicting turn snapshot');
});
it('persists and replays the exact unconfirmed Start after reload',async()=>{
 const ready={...initial('run21'),board:null};let lost=true;mock.snapshot=ready;mock.request.mockImplementation(async(body:any)=>{if(body.op==='action'){if(lost)throw Error('lost response');return {...initial('run21'),revision:2};}return structuredClone(ready);});
 const first=mount();await flush();fireEvent.click(first.getByRole('button',{name:'Begin round 1'}));await flush();const sent=mock.request.mock.calls.find(([c])=>c.op==='action')![0];expect(JSON.parse(sessionStorage.getItem('ptown:async-turn:request:me:child')!)).toEqual(sent);
 first.unmount();lost=false;const second=mount();await flush();expect(mock.request.mock.calls.filter(([c])=>c.op==='action').at(-1)![0]).toEqual(sent);expect(second.container.querySelector('[data-fullscreen-board-slot]')).toBeTruthy();expect(sessionStorage.getItem('ptown:async-turn:request:me:child')).toBeNull();
});

it('Quintzee waits on the existing Start button, submits once and rumbles the first roll',async()=>{
 const started=initial('quintzee');mock.snapshot={...started,board:null};let resolveStart:((v:any)=>void)|undefined;
 mock.request.mockImplementation(async(body:any)=>body.op==='action'?new Promise(resolve=>{resolveStart=resolve;}):structuredClone(mock.snapshot));
 const ui=mount(false,true);await flush();await tick(3000);
 expect(ui.queryAllByRole('button',{name:/Die \d:/})).toHaveLength(0);expect(mock.request.mock.calls.filter(([c])=>c.op==='action')).toHaveLength(0);
 const button=ui.getByRole('button',{name:'Start'});fireEvent.click(button);fireEvent.click(button);await flush();
 expect(mock.request.mock.calls.filter(([c])=>c.op==='action')).toHaveLength(1);expect(ui.queryByText(/saving/i)).toBeNull();
 await act(async()=>resolveStart?.({...started,revision:2}));await flush();
 expect(ui.getAllByRole('button',{name:/Die \d: rolling/})).toHaveLength(5);expect(ui.getByLabelText('Opponent score 0')).toBeTruthy();
 await tick(3000);expect(ui.getAllByRole('button',{name:/Die \d: [1-6]/})).toHaveLength(5);
});

it('resumed Quintzee keeps its dice and deadline without another Start or rumble',async()=>{
 mock.snapshot=initial('quintzee');const ui=mount(false,true);await flush();
 expect(ui.queryByRole('button',{name:'Start'})).toBeNull();expect(ui.queryAllByRole('button',{name:/rolling/})).toHaveLength(0);
 expect(mock.request.mock.calls.every(([c])=>c.op==='state')).toBe(true);expect(mock.snapshot.board.deadline).toBe(180000);
});

it.each(['run21','quintzee','boxdrop'])('%s retains both players and only the disclosed opponent total',async game=>{
 mock.snapshot={...initial(game),totals:{me:0,other:125},pendingResults:{other:1}};const ui=mount();await flush();
 expect(ui.getByLabelText('Opponent score 125')).toBeTruthy();await receive({...mock.snapshot,reviewRevision:1,pendingResults:{other:0},totals:{me:0,other:250}});
 expect(ui.getByLabelText('Opponent score 250')).toBeTruthy();
});

for(const game of ['run21','boxdrop'])it(game+': slow state and Start retain the same handoff without an intermediate screen',async()=>{
 let stateReply!:(v:any)=>void,startReply!:(v:any)=>void;
 const state=new Promise(r=>stateReply=r),started=new Promise(r=>startReply=r);
 mock.request.mockImplementation((body:any)=>body.op==='state'?state:started);
 const ui=mount(false,true);await flush();expect(ui.getByText('Your turn!')).toBeTruthy();
 expect(ui.queryByText(/Preparing|Begin round|Availability deadline/)).toBeNull();
 await act(async()=>stateReply({...initial(game),board:null}));await flush();
 expect(ui.getByText('Your turn!')).toBeTruthy();expect(mock.request.mock.calls.filter(([b])=>b.op==='action')).toHaveLength(1);
 await tick(1000);expect(ui.queryByText(/Preparing|Begin round|Availability deadline/)).toBeNull();
 await act(async()=>startReply({...initial(game),revision:2}));await flush();expect(ui.queryByText('Your turn!')).toBeNull();
 expect(mock.request.mock.calls.filter(([b])=>b.op==='action')).toHaveLength(1);
});
