// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TripFlipView} from './TripFlipView';import {acceptTripFlipSnapshot,tripFlipDots,type TripFlipSnapshot} from '@/lib/tripFlip/model';
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=>null}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:vi.fn(()=>()=>{})}}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({useTriRoundPresentation:()=>{},TriRoundIntro:()=>null}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children}:any)=><main data-fullscreen-board-slot>{children}<div data-canonical-felt-interaction-layer/></main>}));
beforeEach(()=>vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}}));afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const view:TripFlipSnapshot={id:'game',scope:'round-1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'u',name:'You',score:0,active:true}],board:{rules:{version:'trip-flip/1',stageMs:180000,introMs:2500,holdMs:6000,dots:30,dotMs:6000,timePerDot:125},phase:'playing',columns:[[0,13],[],[],[]],cells:[null,null,null],fan:[26,5,52],special:[0,1,2],specialClaimed:false,legalMoves:[[7,0,26],[7,4,26],[0,1,13]],highScore:0,stockRemaining:49,trips:0,runs:0,suitedTotal:0,specialTotal:0,score:0,deadline:181000,event:{label:'',points:0}}};
const props={view,userId:'u',now:1000,pending:false,error:'',epoch:0,onReconnect:()=>{}};
it('selects immediately, sends exact source/destination/card once and retains cards until authority',async()=>{
 let done!:()=>void;const send=vi.fn(()=>new Promise<void>(r=>done=r));render(<TripFlipView {...props} onIntent={send}/>);
 fireEvent.click(screen.getByRole('button',{name:'Fan front: A♦'}));expect(screen.getByRole('button',{name:'Fan front: A♦'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Column 1, 2 cards'}));expect(send).toHaveBeenCalledWith({type:'move',items:[7,0,26]});
 fireEvent.click(screen.getByRole('button',{name:'Fan front: A♦'}));fireEvent.click(screen.getByRole('button',{name:'Flip 1: empty'}));expect(send).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Fan front: A♦'})).toBeTruthy();await act(async()=>done());
});
it('rejects covered cards, observer actions, uncertain commands and stale selection',()=>{
 const send=vi.fn(),ui=render(<TripFlipView {...props} onIntent={send}/>);expect(screen.getByRole('button',{name:'Column 1: A♠, covered'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'Fan covered: 6♠'}).hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Fan front: A♦'}));ui.rerender(<TripFlipView {...props} view={{...view,revision:2}} onIntent={send}/>);fireEvent.click(screen.getByRole('button',{name:'Flip 1: empty'}));expect(send).not.toHaveBeenCalled();
 ui.rerender(<TripFlipView {...props} view={{...view,canAct:false}} onIntent={send}/>);fireEvent.click(screen.getByRole('button',{name:'Take Score'}));expect(send).not.toHaveBeenCalled();
 ui.rerender(<TripFlipView {...props} pending onIntent={send}/>);fireEvent.click(screen.getByRole('button',{name:'Take Score'}));expect(send).not.toHaveBeenCalled();
});
it('clears round transients and removes every gameplay artifact in Session Ended',()=>{
 const ui=render(<TripFlipView {...props} onIntent={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Fan front: A♦'}));ui.rerender(<TripFlipView {...props} view={{...view,scope:'round-2'}} onIntent={()=>{}}/>);expect(screen.getByRole('button',{name:'Fan front: A♦'}).getAttribute('aria-pressed')).toBe('false');
 ui.rerender(<TripFlipView {...props} sessionEnded onIntent={()=>{}}/>);expect(screen.queryByRole('button',{name:'Fan front: A♦'})).toBeNull();expect(screen.queryByRole('button',{name:'Take Score'})).toBeNull();expect(screen.getByLabelText('Player scores')).toBeTruthy();
});
it('rejects identity and equal-revision contradictions, ignores regressions',()=>{
 expect(acceptTripFlipSnapshot(view,{...view,revision:0},'game')).toBe(view);expect(()=>acceptTripFlipSnapshot(view,{...view,id:'other'},'game')).toThrow(/identity/);expect(()=>acceptTripFlipSnapshot(view,{...view,board:{...view.board,score:999}},'game')).toThrow(/conflicting/);expect(acceptTripFlipSnapshot(view,{...view,serverAt:2000},'game').serverAt).toBe(2000);
});
it('projects the frozen dot boundaries without awarding score',()=>{for(let dots=0;dots<=30;dots++){expect(tripFlipDots(view.board,dots*6000)).toBe(dots);if(dots<30)expect(tripFlipDots(view.board,dots*6000+1)).toBe(dots+1);}expect(tripFlipDots(view.board,-1)).toBe(0);expect(view.board.score).toBe(0);});
