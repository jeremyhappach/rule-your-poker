// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {ElevenUpView} from './ElevenUpView';
import {useElevenUp,type ElevenCommand,type ElevenTransport} from '@/hooks/useElevenUp';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
import {platformAudio} from '@/lib/audio/platformAudio';

vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:(p:any)=><section><header>{p.title}<span>{p.description}</span></header>{p.scores}<main data-fullscreen-board-slot>{p.children}<div data-canonical-felt-interaction-layer=""/></main></section>}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({useTriRoundPresentation:()=>({admitted:false}),TriRoundIntro:()=>null}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
const snapshot=():ElevenSnapshot=>({id:'run',revision:1,serverAt:1000,scope:'run:round:actor:1',round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'user',name:'You',score:0,active:true}],board:{rules:{version:'eleven-up/2',stageMs:180000,introMs:2500,readyMs:30000,holdMs:5000,clearCelebrationMs:3000},phase:'playing',slots:[16,20,32,48],current:44,exposed:[0,1,2,3],passSlot:null,canPass:true,stockRemaining:28,groups:0,score:0,deadline:181000,event:{label:'',points:0}}});
const props=(v=snapshot(),onIntent=vi.fn())=>({view:v,userId:'user',now:1000,pending:false,error:'',epoch:0,onIntent,onReconnect:vi.fn()});

it('keeps reclaim available while paused or between rounds and identifies opponent autoplay',()=>{
 const v=snapshot();v.solo=false;v.viewerId='user';v.paused=true;v.canAct=false;
 v.players=[{...v.players[0],autoplay:true,sitOutNextHand:true},{id:'other',name:'Opponent',score:7,active:false,autoplay:true}];
 const intent=vi.fn(),p=props(v,intent),ui=render(<ElevenUpView {...p}/>);
 expect(ui.getByRole('img',{name:'Opponent: Auto-play'})).toBeTruthy();
 fireEvent.click(ui.getByRole('checkbox',{name:'Auto-play'}));expect(intent).toHaveBeenCalledExactlyOnceWith({type:'reclaim'});
 ui.rerender(<ElevenUpView {...p} view={{...v,board:{...v.board,phase:'stage_complete'}}}/>);
 expect(ui.getByRole('checkbox',{name:'Auto-play'})).toBeTruthy();
 ui.rerender(<ElevenUpView {...p} pending/>);expect((ui.getByRole('checkbox',{name:'Auto-play'}) as HTMLInputElement).disabled).toBe(true);
 ui.rerender(<ElevenUpView {...p} sessionEnded/>);expect(ui.queryByRole('checkbox')).toBeNull();expect(ui.queryByRole('img',{name:/Auto-play/})).toBeNull();
});

it('shows named multiplayer achievements and winner pulse without changing Arcade results',()=>{
 const v=snapshot();v.solo=false;v.settled=true;v.board.phase='complete';v.players=[{id:'user',name:'Hap',score:103000,active:true},{id:'other',name:'Sam',score:90000,active:false}];
 v.terminal={resultId:'receipt',startedAt:0,deadline:3000,winnerIds:['user'],score:103000,achievements:{user:{kind:'broken',priorBest:100,overallKind:'broken',overallPriorBest:100,rank:1,topTen:true},other:{kind:'broken',priorBest:80,overallKind:'lower',overallPriorBest:100,rank:2,topTen:true}}};
 const ui=render(<ElevenUpView {...props(v)} onFinish={vi.fn()} terminalPresenting now={4000}/>);
 expect(ui.getByText('Game Over')).toBeTruthy();expect(ui.getByText('Hap wins with 103,000')).toBeTruthy();
 expect(ui.queryByText(/Sam.*all-time high/)).toBeNull();expect(ui.getByText(/Hap.*New personal best/)).toBeTruthy();expect(ui.container.querySelectorAll('[data-winner=true]')).toHaveLength(1);
 expect(ui.queryByRole('button',{name:'Continue'})).toBeNull();
 ui.rerender(<ElevenUpView {...props({...v,solo:true})}/>);
 expect(ui.getByText('Game complete')).toBeTruthy();expect(ui.queryByText('Game Over')).toBeNull();expect(ui.queryByText(/Sam.*all-time high/)).toBeNull();expect(ui.container.querySelectorAll('[data-winner=true]')).toHaveLength(0);
});

it('toggles individual balls, resolves a three-ball eleven once, and removes redundant controls',()=>{
 const onIntent=vi.fn(),ui=render(<StrictMode><ElevenUpView {...props(snapshot(),onIntent)}/></StrictMode>);
 const ball=(n:number)=>ui.getByRole('button',{name:new RegExp(`^Ball ${n},`)});
 fireEvent.click(ball(2));expect(ui.getByLabelText('Selected total 2').textContent).toBe('2');
 fireEvent.click(ball(2));expect(ui.getByLabelText('Selected total 0')).toBeTruthy();
 act(()=>{fireEvent.click(ball(2));fireEvent.click(ball(3));fireEvent.click(ball(6));fireEvent.click(ball(6));fireEvent.click(ball(10));});
 expect(onIntent).toHaveBeenCalledExactlyOnceWith({type:'group',items:[16,20,32]});
 expect(ui.getByLabelText('Selected total 11').textContent).toBe('11');
 expect(ui.queryByRole('button',{name:/Make Eleven|Clear selection/})).toBeNull();
 expect(ui.queryByText(/DRAW ·/)).toBeNull();expect(ui.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('180');
 expect(ui.queryByRole('timer')).toBeNull();expect(ui.getByRole('progressbar').textContent).toBe('');
 expect(ui.getByRole('button',{name:'Pass, 28 draws remaining'})).toBeTruthy();
 expect(ui.queryByText('You')).toBeNull();expect(ui.queryByText(/Arcade/)).toBeNull();
});

it('dings only a new confirmed eleven, with no selection, repeat, recovery or hidden-tab catchup',()=>{
 const sound=vi.spyOn(platformAudio,'request').mockReturnValue(()=>{}),v=snapshot(),p=props(v),ui=render(<ElevenUpView {...p}/>);
 fireEvent.click(ui.getByRole('button',{name:/^Ball 2,/}));expect(sound).not.toHaveBeenCalled();
 const confirmed={...v,revision:2,board:{...v.board,groups:1}};
 ui.rerender(<ElevenUpView {...p} view={confirmed}/>);expect(sound).toHaveBeenCalledTimes(1);
 ui.rerender(<ElevenUpView {...p} view={{...confirmed}}/>);expect(sound).toHaveBeenCalledTimes(1);
 ui.rerender(<ElevenUpView {...p} epoch={1} view={{...confirmed,revision:3,board:{...v.board,groups:2}}}/>);
 ui.rerender(<ElevenUpView {...p} epoch={1} activeTab="lobby" view={{...confirmed,revision:4,board:{...v.board,groups:3}}}/>);
 ui.rerender(<ElevenUpView {...p} epoch={1} view={{...confirmed,revision:4,board:{...v.board,groups:3}}}/>);
 expect(sound).toHaveBeenCalledTimes(1);
});

it('announces only tied winners and uses this score, not an older personal rank',()=>{
 const v=snapshot();v.solo=false;v.settled=true;v.board.phase='complete';
 v.players=[{id:'user',name:'Hap',score:90,active:false},{id:'tie',name:'Tie',score:90,active:false},{id:'loser',name:'Loser',score:80,active:false}];
 v.terminal={resultId:'receipt',startedAt:0,deadline:3000,winnerIds:['user','tie'],score:90,achievements:{user:{kind:'lower',overallKind:'lower',rank:12,topTen:false},tie:{kind:'broken',overallKind:'lower',rank:6,topTen:true},loser:{kind:'broken',overallKind:'lower',rank:8,topTen:true}}};
 const ui=render(<ElevenUpView {...props(v)}/>);
 expect(ui.getByText('Hap & Tie tie with 90')).toBeTruthy();expect(ui.getByText('Tie: #6 on the leaderboard')).toBeTruthy();expect(ui.getByText('Tie: New personal best!')).toBeTruthy();
 expect(ui.container.querySelector('.eleven-achievements')?.textContent).not.toMatch(/Hap|Loser/);
});

it('retains over-eleven selections for individual correction and includes the current ball',()=>{
 const onIntent=vi.fn(),ui=render(<ElevenUpView {...props(snapshot(),onIntent)}/>);
 const two=ui.getByRole('button',{name:/^Ball 2,/}),ten=ui.getByRole('button',{name:/^Ball 10,/});
 fireEvent.click(two);fireEvent.click(ten);expect(ui.getByLabelText('Selected total 12')).toBeTruthy();expect(onIntent).not.toHaveBeenCalled();
 fireEvent.click(ten);fireEvent.click(ui.getByRole('button',{name:'Draw ball 9'}));
 expect(onIntent).toHaveBeenCalledExactlyOnceWith({type:'group',items:[16,44]});
});

it('admits an eleven in Ready, preserves Take Score eligibility, and derives paused time from authority',()=>{
 const v=snapshot();v.board.phase='ready';v.board.deadline=31000;
 const p=props(v),ui=render(<ElevenUpView {...p}/>);
 expect((ui.getByRole('button',{name:'Take Score'}) as HTMLButtonElement).disabled).toBe(true);
 expect(ui.getByRole('timer').textContent).toBe('Select or pass · 0:30');
 fireEvent.click(ui.getByRole('button',{name:/^Ball 2,/}));fireEvent.click(ui.getByRole('button',{name:'Draw ball 9'}));
 expect(p.onIntent).toHaveBeenCalledExactlyOnceWith({type:'group',items:[16,44]});
 ui.rerender(<ElevenUpView {...p} view={{...v,paused:true,pausedAt:11000}} now={21000}/>);
 expect(ui.getByRole('timer').textContent).toBe('Paused · 0:20');
});

it.each(['inactive','pending','error','paused','expired','covered'] as const)('blocks automatic submissions when %s',reason=>{
 const v=snapshot(),p=props(v);
 if(reason==='inactive')v.canAct=false;if(reason==='paused')v.paused=true;if(reason==='expired')p.now=v.board.deadline;
 if(reason==='pending')p.pending=true;if(reason==='error')p.error='Reconnecting…';if(reason==='covered')v.board.exposed=[];
 const ui=render(<ElevenUpView {...p}/>);
 for(const button of ui.getAllByRole('button',{name:/^Ball/}))fireEvent.click(button);
 expect(p.onIntent).not.toHaveBeenCalled();
});

it('resets selection on authority, round, recovery and tab boundaries; preserves multiplayer identification',()=>{
 const v={...snapshot(),solo:false},p=props(v),ui=render(<ElevenUpView {...p}/>);
 expect(ui.getByText('You')).toBeTruthy();
 for(const change of [{view:{...v,revision:2}},{view:{...v,scope:'next-round'}},{epoch:1},{activeTab:'lobby' as const}]){
  fireEvent.click(ui.getByRole('button',{name:/^Ball 2,/}));
  ui.rerender(<ElevenUpView {...p} {...change}/>);expect(ui.getByLabelText('Selected total 0')).toBeTruthy();
  ui.rerender(<ElevenUpView {...p}/>);
 }
 ui.rerender(<ElevenUpView {...p} sessionEnded/>);expect(ui.queryByRole('button',{name:/^Ball/})).toBeNull();
});

it('uses one immutable transport request through rapid taps, lost response, reload and replay',async()=>{
 const initial=snapshot(),confirmed={...initial,revision:2,board:{...initial.board,slots:[],groups:1,score:600}},commands:ElevenCommand[]=[];
 let fail!:(e:Error)=>void;
 const transport:ElevenTransport={load:vi.fn(async()=>initial),subscribe:(_refresh,status)=>{status(true);return()=>{};},send:vi.fn(async command=>{commands.push(command);if(commands.length===1)return new Promise<ElevenSnapshot>((_resolve,reject)=>{fail=reject;});return confirmed;})};
 function Game(){const g=useElevenUp('run','user',transport);return g.snapshot?<ElevenUpView {...props(g.snapshot)} now={g.now} pending={g.pending} error={g.error} epoch={g.epoch} onIntent={g.act} onReconnect={g.reconnect}/>:null;}
 const ui=render(<Game/>);
 await waitFor(()=>expect(ui.getByRole('button',{name:/^Ball 2,/})).toBeTruthy());
 act(()=>{fireEvent.click(ui.getByRole('button',{name:/^Ball 2,/}));fireEvent.click(ui.getByRole('button',{name:'Draw ball 9'}));fireEvent.click(ui.getByRole('button',{name:'Draw ball 9'}));});
 expect(commands).toHaveLength(1);expect(commands[0]).toMatchObject({revision:1,scope:initial.scope,intent:{type:'group',items:[16,44]}});
 await act(async()=>fail(Error('Connection uncertain')));
 expect(sessionStorage.getItem('ptown:eleven-up:1:user:run')).toBeTruthy();ui.unmount();
 render(<Game/>);await waitFor(()=>expect(commands).toHaveLength(2));
 expect(commands[1]).toEqual(commands[0]);await waitFor(()=>expect(sessionStorage.getItem('ptown:eleven-up:1:user:run')).toBeNull());
});

it.each([[true,120000],[true,180000],[false,120000],[false,180000]] as const)('maps authoritative remaining time proportionally: solo=%s, duration=%s', (solo,duration)=>{
 const v=snapshot();v.solo=solo;v.board.rules={...v.board.rules,stageMs:duration,version:duration===120000?'eleven-up/1':'eleven-up/2'};v.board.deadline=1000+duration;
 const p=props(v),ui=render(<ElevenUpView {...p}/>);
 for(const [fraction,lit,tone] of [[1,24,'green'],[.4,10,'green'],[.1,3,'yellow'],[.05,2,'red'],[0,0,'red']] as const){
  const now=v.board.deadline-duration*fraction;
  ui.rerender(<ElevenUpView {...p} now={now} epoch={1}/>);
  const timer=ui.getByRole('progressbar');
  expect(timer.querySelectorAll('i[data-lit=true]')).toHaveLength(lit);
  expect(timer.querySelector('.tri-dots')?.getAttribute('data-tone')).toBe(tone);
  expect(timer.getAttribute('aria-valuemax')).toBe(String(duration/1000));
  expect(timer.getAttribute('aria-valuenow')).toBe(String(duration*fraction/1000));
  expect(timer.textContent).toBe('');expect(ui.queryByRole('timer')).toBeNull();
 }
 const pausedAt=v.board.deadline-duration*.4;
 ui.rerender(<ElevenUpView {...p} view={{...v,paused:true,pausedAt}} now={v.board.deadline+99999}/>);
 expect(ui.getByRole('progressbar').querySelectorAll('i[data-lit=true]')).toHaveLength(10);
 ui.rerender(<ElevenUpView {...p} view={{...v,scope:'next',round:2,board:{...v.board,deadline:duration+500000}}} now={500000}/>);
 expect(ui.getByRole('progressbar').querySelectorAll('i[data-lit=true]')).toHaveLength(24);
 expect(p.onIntent).not.toHaveBeenCalled();expect(v.board.deadline).toBe(duration+1000);
});

it('keeps Take Score in the band, preserves command dispatch, and retires gameplay in Session Ended',()=>{
 const p=props(),ui=render(<ElevenUpView {...p}/>);
 const take=ui.getByRole('button',{name:'Take Score'});
 expect(take.closest('.eleven-score-band')).toBeTruthy();
 expect(take.closest('[data-canonical-felt-interaction-layer]')).toBeTruthy();
 fireEvent.click(take);fireEvent.click(ui.getByRole('button',{name:/^Pass,/}));
 expect(p.onIntent.mock.calls).toEqual([[{type:'take_score'}],[{type:'pass'}]]);
 ui.rerender(<ElevenUpView {...p} sessionEnded/>);
 expect(ui.getByLabelText('Scores')).toBeTruthy();expect(ui.queryByRole('progressbar')).toBeNull();
 expect(ui.queryByRole('button',{name:'Take Score'})).toBeNull();expect(ui.container.querySelector('.eleven-playfield')).toBeNull();
});

it('puts the active player first and scrolls back to them on a multiplayer turn change',()=>{
 const v=snapshot();v.solo=false;v.players=Array.from({length:7},(_,i)=>({id:String(i),name:`Player ${i}`,score:i,active:i===4}));
 const p=props(v),ui=render(<ElevenUpView {...p}/>),scores=ui.getByLabelText('Scores');
 expect(scores.firstElementChild?.textContent).toBe('Player 44');scores.scrollLeft=100;
 ui.rerender(<ElevenUpView {...p} view={{...v,players:v.players.map(player=>({...player,active:player.id==='6'}))}}/>);
 expect(scores.firstElementChild?.textContent).toBe('Player 66');expect(scores.scrollLeft).toBe(0);
 expect(v.players.map(player=>player.id)).toEqual(['0','1','2','3','4','5','6']);
});
