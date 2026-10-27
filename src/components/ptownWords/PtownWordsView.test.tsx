// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children,actions}:any)=><div>{children}{actions}</div>}));
import {PtownWordsView} from './PtownWordsView';
const view={identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},revision:0,serverAt:1000,rules:{version:'ptown-words/1',dictionaryId:'enable2k/1',dictionarySha256:'hash',turnMs:180000},players:[{id:'me',userId:'u1',name:'You',seat:1,isBot:false},{id:'other',userId:'u2',name:'Pat',seat:2,isBot:true}],viewerId:'me',activePlayerId:'me',board:Array(225).fill(null),rack:[{id:1,face:'C',value:3},{id:2,face:'A',value:1},{id:3,face:'?',value:0}],scores:{me:0,other:0},turn:1,deadline:181000,canAct:true,paused:false,phase:'playing',bagCount:86,rackCounts:{me:3,other:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{me:100,other:100},resultId:null,batch:null},moves:[],event:{label:'Game started',points:0}} as WordsSnapshot;
const intent=vi.fn(async()=>true),props={view,now:1000,pending:false,connected:true,error:'',activeTab:'cards' as const,setActiveTab:vi.fn(),panel:null,sessionEnded:false,onIntent:intent,onReconnect:vi.fn()};
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});intent.mockClear();});afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function tap(cell:Element){fireEvent.click(cell,{detail:1,clientX:100,clientY:100});}
it('double-tap zooms out without placing, returning a staged tile, or submitting',()=>{
 const {container}=render(<PtownWordsView {...props}/>);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));const cell=container.querySelector('[data-square="112"]')!;
 tap(cell);act(()=>vi.advanceTimersByTime(120));tap(cell);act(()=>vi.advanceTimersByTime(400));expect(container.querySelectorAll('.is-staged')).toHaveLength(0);expect(screen.getByRole('button',{name:'C, 3 points'}).getAttribute('aria-pressed')).toBe('true');expect(screen.queryByRole('button',{name:'Zoom Out'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Zoom In'}));tap(cell);act(()=>vi.advanceTimersByTime(301));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
 tap(cell);act(()=>vi.advanceTimersByTime(120));tap(cell);act(()=>vi.advanceTimersByTime(400));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);expect(intent).not.toHaveBeenCalled();
 expect([...container.querySelectorAll('.words-turn-actions button')].map(b=>b.textContent)).toEqual(['Undo','Recall','Exchange','Pass']);expect(screen.getByRole('button',{name:'Submit Word'}).parentElement?.className).toBe('words-player');
});
it('double-tapping with a blank selected never opens its letter picker',()=>{const {container}=render(<PtownWordsView {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Blank, 0 points'}));const cell=container.querySelector('[data-square="112"]')!;tap(cell);act(()=>vi.advanceTimersByTime(100));tap(cell);act(()=>vi.advanceTimersByTime(400));expect(screen.queryByRole('dialog')).toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);});
it('a new turn cancels a pending tap before it can alter a draft',()=>{const {container,rerender}=render(<PtownWordsView {...props}/>);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));tap(container.querySelector('[data-square="112"]')!);rerender(<PtownWordsView {...props} view={{...view,turn:2,canAct:false,activePlayerId:'other'}}/>);act(()=>vi.advanceTimersByTime(400));expect(container.querySelectorAll('.is-staged')).toHaveLength(0);});
