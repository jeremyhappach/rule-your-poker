// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {ElevenUpView} from './ElevenUpView';
import {useElevenUp,type ElevenCommand,type ElevenTransport} from '@/hooks/useElevenUp';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';

vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:(p:any)=><section><header>{p.title}<span>{p.description}</span></header>{p.scores}<main data-fullscreen-board-slot>{p.children}<div data-canonical-felt-interaction-layer=""/></main></section>}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({useTriRoundPresentation:()=>({admitted:false}),TriRoundIntro:()=>null}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
const snapshot=():ElevenSnapshot=>({id:'run',revision:1,serverAt:1000,scope:'run:round:actor:1',round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'user',name:'You',score:0,active:true}],board:{rules:{version:'eleven-up/2',stageMs:180000,introMs:2500,readyMs:30000,holdMs:5000,clearCelebrationMs:3000},phase:'playing',slots:[16,20,32,48],current:44,exposed:[0,1,2,3],passSlot:null,canPass:true,stockRemaining:28,groups:0,score:0,deadline:181000,event:{label:'',points:0}}});
const props=(v=snapshot(),onIntent=vi.fn())=>({view:v,userId:'user',now:1000,pending:false,error:'',epoch:0,onIntent,onReconnect:vi.fn()});

it('toggles individual balls, resolves a three-ball eleven once, and removes redundant controls',()=>{
 const onIntent=vi.fn(),ui=render(<StrictMode><ElevenUpView {...props(snapshot(),onIntent)}/></StrictMode>);
 const ball=(n:number)=>ui.getByRole('button',{name:new RegExp(`^Ball ${n},`)});
 fireEvent.click(ball(2));expect(ui.getByLabelText('Selected total 2').textContent).toBe('2');
 fireEvent.click(ball(2));expect(ui.getByLabelText('Selected total 0')).toBeTruthy();
 act(()=>{fireEvent.click(ball(2));fireEvent.click(ball(3));fireEvent.click(ball(6));fireEvent.click(ball(6));fireEvent.click(ball(10));});
 expect(onIntent).toHaveBeenCalledExactlyOnceWith({type:'group',items:[16,20,32]});
 expect(ui.getByLabelText('Selected total 11').textContent).toBe('11');
 expect(ui.queryByRole('button',{name:/Make Eleven|Clear selection/})).toBeNull();
 expect(ui.queryByText(/DRAW ·/)).toBeNull();expect(ui.getByRole('timer').textContent).toBe('3:00');
 expect(ui.getByRole('button',{name:'Pass, 28 draws remaining'})).toBeTruthy();
 expect(ui.queryByText('You')).toBeNull();expect(ui.queryByText(/Arcade/)).toBeNull();
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
