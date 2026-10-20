// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TakeTwoView,TakeTwoRules} from './TakeTwoView';
import type {TakeTwoSnapshot} from '@/lib/takeTwo/model';
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=>null}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({useTriRoundPresentation:()=>({fraction:0}),TriRoundIntro:()=>null,TriScorePill:()=>null}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children}:any)=><main data-fullscreen-board-slot>{children}<div data-canonical-felt-interaction-layer/></main>}));
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const view:TakeTwoSnapshot={id:'game',scope:'round-1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'u',name:'You',score:0,active:true}],board:{rules:{version:'take-two/1',stageMs:100000,introMs:2500,holdMs:6000,meterMax:500,meterMin:50,meterHoldMs:1000,meterStepsPerSecond:30,meterStep:5},phase:'playing',slots:[1,2,4,5],current:9,layout:[0,1,2,3].map(column=>({row:0,column,x:column*2})),legalPairs:[[0,1],[2,3]],exposed:[0,1,2,3],highScore:0,stockRemaining:23,samePairs:0,consecutivePairs:0,meterAt:1000,score:0,deadline:101000,event:{label:'',points:0}}};
const props={view,userId:'u',now:1000,pending:false,error:'',epoch:0,onReconnect:()=>{}};
const card=(n:number)=>screen.getByRole('button',{name:new RegExp(`^Row 1, card ${n}:`)});
it.each([true,false])('updates the meter only from an accepted draw snapshot (solo=%s)',async solo=>{
 let resolve!:()=>void;const send=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
 const before={...view,solo,board:{...view.board,rules:{...view.board.rules,version:'take-two/2' as const,drawResetsMeter:true}}};
 const ui=render(<TakeTwoView {...props} now={10000} view={before} onIntent={send}/>);
 const meter=()=>screen.getByRole('meter').getAttribute('aria-valuenow');
 expect(meter()).toBe('50');fireEvent.click(screen.getByRole('button',{name:/Next Card/i}));
 expect(send).toHaveBeenCalledWith({type:'draw'});expect(meter()).toBe('50');
 await act(async()=>resolve());expect(meter()).toBe('50');
 const accepted={...before,revision:2,board:{...before.board,meterAt:10000,stockRemaining:22}};
 ui.rerender(<TakeTwoView {...props} now={10000} view={accepted} onIntent={send}/>);expect(meter()).toBe('500');
 ui.rerender(<TakeTwoView {...props} now={12000} view={accepted} onIntent={send}/>);expect(meter()).toBe('350');
 expect(accepted.board.deadline).toBe(before.board.deadline);
});
it('shows frozen legacy rules and the current draw-reset rules',()=>{
 const ui=render(<TakeTwoRules version="take-two/1"/>);expect(screen.getByText(/Only a successful pair resets/)).toBeTruthy();
 ui.rerender(<TakeTwoRules version="take-two/2"/>);expect(screen.getByText(/accepted Next Card draw resets it to 500/)).toBeTruthy();
 expect(screen.getByText(/Drawing never changes the round clock/)).toBeTruthy();
});
it('immediately highlights both cards, preserves them until authority, and permits safe next-card selection without a second command',async()=>{
 let resolve!:()=>void;const send=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));const ui=render(<TakeTwoView {...props} onIntent={send}/>);
 fireEvent.click(card(1));fireEvent.click(card(2));expect(send).toHaveBeenCalledTimes(1);
 expect(card(1).getAttribute('aria-pressed')).toBe('true');expect(card(2).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(card(3));fireEvent.click(card(4));expect(send).toHaveBeenCalledTimes(1);expect(card(4).getAttribute('aria-pressed')).toBe('true');
 const next={...view,revision:2,board:{...view.board,slots:[null,null,4,5],exposed:[2,3],legalPairs:[[2,3] as [number,number]],score:900}};
 ui.rerender(<TakeTwoView {...props} view={next} onIntent={send}/>);
 expect(screen.queryByRole('button',{name:/^Row 1, card 1:/})).toBeNull();expect(card(4).getAttribute('aria-pressed')).toBe('true');
 await act(async()=>resolve());fireEvent.click(card(3));expect(send).toHaveBeenCalledTimes(2);
});
it('releases the view guard after a rejected/no-change action and resets selection across round identity',async()=>{
 const send=vi.fn(async()=>{}),ui=render(<TakeTwoView {...props} onIntent={send}/>);
 fireEvent.click(card(1));await act(async()=>fireEvent.click(card(2)));
 fireEvent.click(card(1));await act(async()=>fireEvent.click(card(2)));expect(send).toHaveBeenCalledTimes(2);
 fireEvent.click(card(3));ui.rerender(<TakeTwoView {...props} view={{...view,scope:'round-2'}} onIntent={send}/>);
 expect(card(3).getAttribute('aria-pressed')).toBe('false');
});
it('does not submit an invalid pair, a paused action or a command while transport remains uncertain',()=>{
 const send=vi.fn(),ui=render(<TakeTwoView {...props} pending onIntent={send}/>);
 fireEvent.click(card(1));fireEvent.click(card(2));expect(send).not.toHaveBeenCalled();
 ui.rerender(<TakeTwoView {...props} epoch={1} onIntent={send}/>);fireEvent.click(card(1));fireEvent.click(card(3));expect(send).not.toHaveBeenCalled();
 ui.rerender(<TakeTwoView {...props} view={{...view,paused:true}} onIntent={send}/>);fireEvent.click(card(4));expect(send).not.toHaveBeenCalled();
});
