// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
const {placementSound,countdownSound}=vi.hoisted(()=>({placementSound:vi.fn(),countdownSound:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{getSnapshot:()=>({userId:'u1'}),present:countdownSound}}));
vi.mock('@/lib/audio/approvedSounds',()=>({approvedCountdownBeat:vi.fn(()=>({durationMs:180,schedule:vi.fn()}))}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:placementSound,isSoundSurfaceVisible:()=>true}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children,actions,scores}:Pick<import('react').ComponentProps<typeof import('@/lib/canonicalShell/FullscreenGameShell').FullscreenGameShell>,'children'|'actions'|'scores'>)=><div>{scores}{children}{actions}</div>}));
import {PtownWordsView} from './PtownWordsView';
import {shuffleRack,isInvalidWord} from '@/lib/ptownWords/rackPresentation';
const view={identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},revision:0,serverAt:1000,rules:{version:'ptown-words/1',dictionaryId:'enable2k/1',dictionarySha256:'hash',turnMs:180000},players:[{id:'me',userId:'u1',name:'You',seat:1,isBot:false},{id:'other',userId:'u2',name:'Pat',seat:2,isBot:true}],viewerId:'me',activePlayerId:'me',board:Array(225).fill(null),rack:[{id:1,face:'C',value:3},{id:2,face:'A',value:1},{id:3,face:'?',value:0}],scores:{me:0,other:0},turn:1,deadline:181000,canAct:true,paused:false,phase:'playing',bagCount:86,rackCounts:{me:3,other:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{me:100,other:100},resultId:null,batch:null},moves:[],event:{label:'Game started',points:0}} as WordsSnapshot;
const intent=vi.fn(async()=>true),props={view,now:1000,pending:false,connected:true,error:'',activeTab:'cards' as const,setActiveTab:vi.fn(),panel:null,sessionEnded:false,onIntent:intent,onReconnect:vi.fn()};
const hit=vi.fn<(x:number,y:number)=>Element|null>();
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();vi.useFakeTimers();vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
 vi.spyOn(Element.prototype,'clientWidth','get').mockReturnValue(360);
 vi.spyOn(Element.prototype,'clientHeight','get').mockReturnValue(380);
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:hit});
 hit.mockReset();intent.mockReset();intent.mockResolvedValue(true);countdownSound.mockClear();
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();Reflect.deleteProperty(document,'elementFromPoint');});
const board=(container:HTMLElement)=>container.querySelector<HTMLDivElement>('.words-viewport')!;
const square=(container:HTMLElement,n:number)=>container.querySelector<HTMLButtonElement>(`[data-square="${n}"]`)!;
const level=(container:HTMLElement)=>Number(board(container).dataset.zoom);
const zoomIn=(container:HTMLElement)=>fireEvent.keyDown(board(container),{key:'+'});
function pointer(kind:'down'|'move'|'up'|'cancel',element:Element,x:number,y:number,pointerId=1,pointerType='mouse'){
 const fn={down:fireEvent.pointerDown,move:fireEvent.pointerMove,up:fireEvent.pointerUp,cancel:fireEvent.pointerCancel}[kind];
 fn(element,{pointerId,pointerType,button:0,clientX:x,clientY:y});
}
function tap(cell:Element){
 pointer('down',cell,100,100);
 pointer('up',cell,100,100);
 fireEvent.click(cell,{detail:1,clientX:100,clientY:100});
}
function drag(from:Element,to:Element|null){
 hit.mockReturnValue(to);
 pointer('down',from,100,100);
 pointer('move',from,140,150);
 pointer('up',from,140,150);
 fireEvent.click(from,{detail:1});
}
it('view-only immediately retires a staged blank/dialog and permits navigation even with a stale actionable snapshot',()=>{
 const {container,rerender}=render(<PtownWordsView {...props} asyncDraftUserId="u1"/>);
 fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);
 fireEvent.click(screen.getByRole('button',{name:'Blank, 0 points'}));fireEvent.click(container.querySelector('[data-square="113"]')!);
 expect(screen.getByRole('dialog')).toBeTruthy();
 rerender(<PtownWordsView {...props} asyncDraftUserId="u1" readOnly/>);
 expect(screen.queryByRole('dialog')).toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 expect(screen.getByText("Opponent's Turn — View Only")).toBeTruthy();
 tap(square(container,113));expect(level(container)).toBe(1);
 zoomIn(container);expect(level(container)).toBe(1.25);
 expect((screen.getByRole('button',{name:'Pass'}) as HTMLButtonElement).disabled).toBe(true);expect(intent).not.toHaveBeenCalled();
 rerender(<PtownWordsView {...props} asyncDraftUserId="u1"/>);expect(screen.queryByText("Opponent's Turn — View Only")).toBeNull();
});
it.each([false,true])('sounds only new visible tile staging in live/Async mode (%s)',asyncMode=>{
 placementSound.mockClear();
 const ui=render(<PtownWordsView {...props} asyncDraftUserId={asyncMode?'u1':undefined}/>);
 fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));expect(placementSound).not.toHaveBeenCalled();
 fireEvent.click(ui.container.querySelector('[data-square="112"]')!);expect(placementSound).toHaveBeenCalledOnce();
 expect(placementSound.mock.lastCall?.[0]).toBe('peg');expect(placementSound.mock.lastCall?.[2]?.classList.contains('is-staged')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'A, 1 points'}));fireEvent.click(ui.container.querySelector('[data-square="113"]')!);expect(placementSound).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'Blank, 0 points'}));fireEvent.click(square(ui.container,114));expect(placementSound).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'T'}));expect(placementSound).toHaveBeenCalledTimes(3);
 ui.rerender(<PtownWordsView {...props} error="ptown_words:invalid_word:CAT" asyncDraftUserId={asyncMode?'u1':undefined}/>);expect(placementSound).toHaveBeenCalledTimes(3);
 ui.unmount();placementSound.mockClear();
 render(<PtownWordsView {...props} asyncDraftUserId={asyncMode?'u1':undefined}/>);expect(placementSound).not.toHaveBeenCalled();
});
it('lets a rack tap choose its destination after two aligned placements',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 tap(screen.getByRole('button',{name:'C, 3 points'}));tap(square(container,112));
 tap(screen.getByRole('button',{name:'A, 1 points'}));tap(square(container,113));
 tap(screen.getByRole('button',{name:'Blank, 0 points'}));expect(screen.queryByRole('dialog')).toBeNull();
 tap(square(container,127));fireEvent.click(screen.getByRole('button',{name:'T'}));
 expect(square(container,127).textContent).toBe('T0');expect(container.querySelectorAll('.is-staged')).toHaveLength(3);
 expect(level(container)).toBe(1);expect(intent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));fireEvent.click(screen.getByRole('button',{name:'Undo'}));
 tap(screen.getByRole('button',{name:'A, 1 points'}));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
});
const bankView={...view,rules:{...view.rules,version:'ptown-words/2',timeBankUses:2,timeBankMs:180000},hostUserId:'u1',pauseVersion:0,timeBankSpent:{}};
it('keeps two match-scoped bank slots, preserves draft and displays added remaining time',()=>{
 const {container,rerender}=render(<PtownWordsView {...props} view={bankView}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);
 fireEvent.click(screen.getByRole('button',{name:'Use time bank 1: add 3 minutes'}));expect(intent).toHaveBeenLastCalledWith({type:'time_bank',items:[{slot:0}]});
 rerender(<PtownWordsView {...props} view={{...bankView,revision:1,deadline:361000,timeBankSpent:{me:[0]}}}/>);expect(container.querySelector('.is-staged')).not.toBeNull();expect(screen.queryByRole('button',{name:'Use time bank 1: add 3 minutes'})).toBeNull();expect(container.querySelector('time')?.textContent).toBe('6:00');
 rerender(<PtownWordsView {...props} view={{...bankView,turn:3,revision:3,timeBankSpent:{me:[0,1]}}}/>);expect(screen.queryByText('+3m')).toBeNull();
});
it('host pause uses the canonical callback and non-host pause only requests',()=>{
 const pause=vi.fn(),{rerender}=render(<PtownWordsView {...props} view={bankView} onPause={pause}/>);fireEvent.click(screen.getByRole('button',{name:'Pause game'}));expect(pause).toHaveBeenCalledOnce();expect(intent).not.toHaveBeenCalled();
 rerender(<PtownWordsView {...props} view={{...bankView,hostUserId:'u2',canAct:false}} onPause={pause}/>);fireEvent.click(screen.getByRole('button',{name:'Request pause'}));expect(intent).toHaveBeenLastCalledWith({type:'request_pause'});expect(pause).toHaveBeenCalledOnce();
});
it('lets only the requester cancel the specific pending request, then restores request without discarding a draft',()=>{
 const request={id:'request-one',playerId:'me',hostUserId:'u2',pauseVersion:0},guest={...bankView,hostUserId:'u2'};
 const {container,rerender}=render(<PtownWordsView {...props} view={guest}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);
 rerender(<PtownWordsView {...props} view={{...guest,revision:1,pauseRequest:request,canAct:false}}/>);
 const cancel=screen.getByRole('button',{name:'Cancel pause request'});expect(cancel.getAttribute('data-cancel-request')).toBe('true');expect((cancel as HTMLButtonElement).disabled).toBe(false);fireEvent.click(cancel);expect(intent).toHaveBeenLastCalledWith({type:'cancel_pause_request',items:[{requestId:'request-one'}]});expect(container.querySelector('.is-staged')).not.toBeNull();
 rerender(<PtownWordsView {...props} pending view={{...guest,revision:1,pauseRequest:request}}/>);expect((screen.getByRole('button',{name:'Cancel pause request'}) as HTMLButtonElement).disabled).toBe(true);
 rerender(<PtownWordsView {...props} view={{...guest,revision:2}}/>);expect(screen.queryByRole('button',{name:'Cancel pause request'})).toBeNull();expect((screen.getByRole('button',{name:'Request pause'}) as HTMLButtonElement).disabled).toBe(false);expect(container.querySelector('.is-staged')).not.toBeNull();
 rerender(<PtownWordsView {...props} view={{...guest,revision:3,pauseRequest:{...request,playerId:'other'}}}/>);expect(screen.queryByRole('button',{name:'Cancel pause request'})).toBeNull();expect((screen.getByRole('button',{name:'Request pause'}) as HTMLButtonElement).disabled).toBe(true);
});
it('a paused snapshot retires the cancel affordance and cannot let a non-host resume',()=>{
 const pause=vi.fn();render(<PtownWordsView {...props} onPause={pause} view={{...bankView,hostUserId:'u2',paused:true,pauseRequest:{id:'old',playerId:'me',hostUserId:'u2',pauseVersion:0}}}/>);
 expect(screen.queryByRole('button',{name:'Cancel pause request'})).toBeNull();const resume=screen.getByRole('button',{name:'Resume game'});expect((resume as HTMLButtonElement).disabled).toBe(true);fireEvent.click(resume);expect(pause).not.toHaveBeenCalled();expect(intent).not.toHaveBeenCalled();
});
it('conceals board/rack from first paused render, including accessible labels; only host can resume',()=>{
 const board=[...view.board];board[112]={id:20,face:'Z',letter:'Z',value:10};const pause=vi.fn(),paused={...bankView,board,paused:true,pausedAt:2000};
 const {container,rerender}=render(<PtownWordsView {...props} view={paused} now={9000} onPause={pause}/>);expect(container.querySelectorAll('.words-cell b,.words-rack small')).toHaveLength(0);expect(screen.queryByRole('button',{name:'C, 3 points'})).toBeNull();expect(screen.getAllByRole('button',{name:'Concealed tile'})).toHaveLength(3);expect(container.querySelector('time')?.textContent).toBe('2:59');
 fireEvent.click(screen.getByRole('button',{name:'Resume game'}));expect(pause).toHaveBeenCalledOnce();rerender(<PtownWordsView {...props} view={{...paused,hostUserId:'u2'}} onPause={pause}/>);expect((screen.getByRole('button',{name:'Resume game'}) as HTMLButtonElement).disabled).toBe(true);
});

for(const mode of ['sync','async'])for(const steps of [0,1,2])it(mode+' tile actions keep the selected camera after '+steps+' zoom steps',()=>{
 const {container}=render(<PtownWordsView {...props} asyncDraftUserId={mode==='async'?'u1':undefined}/>);
 const cell=(n:number)=>square(container,n);
 for(let i=0;i<steps;i++)zoomIn(container);
 const unchanged=()=>expect(level(container)).toBe(1.25**steps);
 tap(screen.getByRole('button',{name:'C, 3 points'}));tap(cell(112));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);unchanged();
 tap(cell(112));expect(screen.getByRole('button',{name:'C, 3 points'}).getAttribute('aria-pressed')).toBe('true');tap(cell(113));unchanged();expect(cell(113).textContent).toContain('C');
 tap(cell(113));tap(cell(113));unchanged();expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
 tap(screen.getByRole('button',{name:'A, 1 points'}));tap(screen.getByRole('button',{name:'A, 1 points'}));unchanged();
 tap(screen.getByRole('button',{name:'A, 1 points'}));tap(cell(114));
 tap(screen.getByRole('button',{name:'Blank, 0 points'}));tap(cell(115));fireEvent.click(screen.getByRole('button',{name:'T'}));unchanged();
 expect(container.querySelectorAll('.is-staged')).toHaveLength(3);
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));fireEvent.click(screen.getByRole('button',{name:'Recall'}));unchanged();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 tap(cell(112));tap(screen.getByRole('button',{name:'C, 3 points'}));unchanged();tap(cell(112));unchanged();
 expect(intent).not.toHaveBeenCalled();
});
it('cancels a held pointer on a new authoritative turn',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);
 tap(screen.getByRole('button',{name:'C, 3 points'}));
 const cell=square(container,112);pointer('down',cell,100,100);
 rerender(<PtownWordsView {...props} view={{...view,turn:2,canAct:false,activePlayerId:'other'}}/>);
 pointer('up',cell,100,100);fireEvent.click(cell,{detail:1});
 expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
});
it('keeps the full board through single and double taps and resets keyboard zoom',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 tap(square(container,112));tap(square(container,112));
 expect(level(container)).toBe(1);
 expect(screen.getByRole('button',{name:'Reset Zoom',hidden:true})).toHaveProperty('disabled',true);
 zoomIn(container);expect(level(container)).toBe(1.25);
 fireEvent.click(screen.getByRole('button',{name:'Reset Zoom'}));expect(level(container)).toBe(1);
 expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
});
it('keeps the draft and zoom while submitting and after server rejection',async()=>{
 let reply!:(value:boolean)=>void;intent.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{reply=resolve;}));
 const {container}=render(<PtownWordsView {...props}/>);zoomIn(container);
 tap(screen.getByRole('button',{name:'C, 3 points'}));tap(square(container,112));
 fireEvent.click(screen.getByRole('button',{name:'Submit Word'}));expect(level(container)).toBe(1.25);expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
 await act(async()=>reply(false));expect(level(container)).toBe(1.25);expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
});
const ownMove={turn:1,playerId:'me',action:'place' as const,points:4,count:2,words:[{word:'CA',points:4,square:112,direction:1}]};
const accepted={...view,turn:2,moves:[ownMove],canAct:false,activePlayerId:'other'};
const opponent={...view,turn:3,moves:[ownMove,{...ownMove,turn:2,playerId:'other'}],movePresentation:{version:1 as const,turn:2,playerId:'other',squares:[127,128],startedAt:1100,announceAt:1820,readyAt:3770,flipMs:260,focusMs:200,noticeMs:1600}};
it('zooms out on authoritative acceptance and restores overview after the opponent reveal',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);zoomIn(container);expect(level(container)).toBe(1.25);
 rerender(<PtownWordsView {...props} view={accepted}/>);expect(level(container)).toBe(1);
 rerender(<PtownWordsView {...props} view={opponent} now={1200}/>);expect(level(container)).toBeGreaterThan(1);
 rerender(<PtownWordsView {...props} view={opponent} now={4000}/>);expect(level(container)).toBe(1);
});
it('handles acceptance and opponent reveal arriving together without restoring the old zoom',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);zoomIn(container);
 rerender(<PtownWordsView {...props} view={opponent} now={1200}/>);expect(level(container)).toBeGreaterThan(1);
 rerender(<PtownWordsView {...props} view={opponent} now={4000}/>);expect(level(container)).toBe(1);
});
it('shows each dictionary rejection for 1500ms without discarding draft/camera or resetting the clock',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);zoomIn(container);
 tap(screen.getByRole('button',{name:'C, 3 points'}));tap(square(container,112));
 rerender(<PtownWordsView {...props} error="ptown_words:invalid_word:CC" errorVersion={1}/>);expect(screen.getByRole('alert').textContent).toBe('invalid word');
 act(()=>vi.advanceTimersByTime(1499));expect(screen.getByRole('alert')).not.toBeNull();act(()=>vi.advanceTimersByTime(1));expect(screen.queryByRole('alert')).toBeNull();
 rerender(<PtownWordsView {...props} now={3000} error="ptown_words:invalid_word:CC" errorVersion={2}/>);expect(screen.getByRole('alert')).not.toBeNull();expect(container.querySelector('time')?.textContent).toBe('2:58');
 expect(container.querySelectorAll('.is-staged')).toHaveLength(1);expect(level(container)).toBe(1.25);
 rerender(<PtownWordsView {...props} error="Connection uncertain. Reconnect to retry." errorVersion={3}/>);expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByRole('status').textContent).toContain('Connection uncertain');
 for(const error of ['42501','ptown_words:disconnected','ptown_words:rate_limited','invalid_word:CAT'])expect(isInvalidWord(error)).toBe(false);
});
it('shuffles presentation IDs while preserving selection, staged placements, recall and authority',()=>{
 const {container}=render(<PtownWordsView {...props}/>);const ids=()=>[...container.querySelectorAll('.words-rack button')].map(b=>b.getAttribute('data-tile-id'));
 const before=ids();fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(screen.getByRole('button',{name:'Shuffle rack'}));expect(ids()).not.toEqual(before);expect(screen.getByRole('button',{name:'C, 3 points'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(container.querySelector('[data-square="112"]')!);expect(screen.queryByRole('button',{name:'Exchange'})).toBeNull();expect(screen.queryByRole('button',{name:'Pass'})).toBeNull();
 for(let i=0;i<8;i++)fireEvent.click(screen.getByRole('button',{name:'Shuffle rack'}));expect(container.querySelector('.is-staged')?.textContent).toBe('C3');expect(ids().sort()).toEqual(before.sort());expect(intent).not.toHaveBeenCalled();expect(container.querySelector('time')?.textContent).toBe('3:00');
 fireEvent.click(screen.getByRole('button',{name:'Recall'}));expect(screen.getByRole('button',{name:'Pass'})).not.toBeNull();expect(screen.getByRole('button',{name:'Exchange'})).not.toBeNull();
 expect(shuffleRack([1],()=>0)).toEqual([1]);expect(shuffleRack([1,2,3],()=>.999)).not.toEqual([1,2,3]);
});
it('restores actions after final undo with a short rack and preserves the bag exchange limit',()=>{
 const {container}=render(<PtownWordsView {...props} view={{...view,bagCount:6}}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'Undo'}));
 expect((screen.getByRole('button',{name:'Exchange'}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole('button',{name:'Pass'}) as HTMLButtonElement).disabled).toBe(false);
});
it('highlights the presented actor and enables rack/pulse only at the authoritative handoff',()=>{
 const {container,rerender}=render(<PtownWordsView {...props} view={opponent} now={1200}/>);expect(container.querySelector('.words-rack')?.getAttribute('data-actionable')).toBe('false');expect(container.querySelector('[data-active="true"]')?.textContent).toContain('Pat');expect(container.querySelector('.words-your-turn')).toBeNull();
 rerender(<PtownWordsView {...props} view={opponent} now={4000}/>);expect(container.querySelector('.words-rack')?.getAttribute('data-actionable')).toBe('true');expect(container.querySelector('[data-active="true"]')?.textContent).toContain('You');expect(container.querySelector('.words-your-turn')).not.toBeNull();
});
it('exchanges selected IDs only, and cancel does not send an action',async()=>{
 render(<PtownWordsView {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Exchange'}));expect((screen.getByRole('button',{name:'Exchange 0 tiles'}) as HTMLButtonElement).disabled).toBe(true);
 const dialog=screen.getByRole('dialog');fireEvent.click(dialog.querySelector('.words-exchange button')!);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Exchange 1 tiles'})));expect(intent).toHaveBeenLastCalledWith({type:'exchange',items:[{tileId:1}]});
 fireEvent.click(screen.getByRole('button',{name:'Exchange'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(intent).toHaveBeenCalledTimes(1);
});

it('does not place a selected tile after pointer cancellation or movement beyond the tap threshold',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 tap(screen.getByRole('button',{name:'C, 3 points'}));
 const cell=square(container,112);
 pointer('down',cell,100,100);pointer('move',cell,112,100);pointer('up',cell,112,100);
 pointer('down',cell,100,100);pointer('cancel',cell,100,100);pointer('up',cell,100,100);
 expect(level(container)).toBe(1);expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
});


it('drags rack to bonus, repositions, and returns the exact tile to its rack slot',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 const rackTile=screen.getByRole('button',{name:'C, 3 points'});
 const rackOrder=()=>[...container.querySelectorAll<HTMLElement>('[data-tile-id]')].map(tile=>tile.dataset.tileId);
 const order=rackOrder();
 expect(square(container,112).textContent).toBe('PT');
 drag(rackTile,square(container,112));expect(square(container,112).textContent).toBe('C3');
 drag(square(container,112),square(container,113));expect(square(container,112).textContent).toBe('PT');
 expect(square(container,113).textContent).toBe('C3');expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
 drag(square(container,113),rackTile);expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 expect(rackOrder()).toEqual(order);expect(rackTile).toHaveProperty('disabled',false);expect(intent).not.toHaveBeenCalled();
});
it('returns invalid drops to their origin and never picks up a committed tile',()=>{
 const committed=[...view.board];committed[111]={id:99,face:'A',letter:'A',value:1};
 const {container}=render(<PtownWordsView {...props} view={{...view,board:committed}}/>);
 const rackTile=screen.getByRole('button',{name:'C, 3 points'});
 drag(rackTile,square(container,111));expect(document.querySelector('.words-tile-ghost[data-returning]')).toBeTruthy();
 expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 drag(rackTile,square(container,112));
 drag(screen.getByRole('button',{name:'A, 1 points'}),square(container,112));expect(square(container,112).textContent).toBe('C3');
 drag(square(container,112),null);expect(square(container,112).textContent).toBe('C3');
 drag(square(container,111),square(container,113));expect(square(container,111).textContent).toBe('A1');
 expect(container.querySelectorAll('.is-staged')).toHaveLength(1);expect(intent).not.toHaveBeenCalled();
});
it('prompts once for a dragged blank and retains its zero-point letter when moved',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 const blank=screen.getByRole('button',{name:'Blank, 0 points'});
 drag(blank,square(container,112));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(container.querySelectorAll('.is-staged')).toHaveLength(0);expect(blank).toHaveProperty('disabled',false);
 drag(blank,square(container,112));fireEvent.click(screen.getByRole('button',{name:'T'}));
 drag(square(container,112),square(container,113));expect(screen.queryByRole('dialog')).toBeNull();
 expect(square(container,113).textContent).toBe('T0');expect(intent).not.toHaveBeenCalled();
});
it('cancels captured drags without staging on release or compatibility click',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 const rackTile=screen.getByRole('button',{name:'C, 3 points'});
 hit.mockReturnValue(square(container,112));
 pointer('down',rackTile,100,100);pointer('move',rackTile,140,150);
 expect(document.querySelector('.words-tile-ghost')).toBeTruthy();
 pointer('cancel',rackTile,-5,-5);pointer('up',rackTile,140,150);fireEvent.click(rackTile,{detail:1});
 expect(document.querySelector('.words-tile-ghost')).toBeNull();
 expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 expect(rackTile.getAttribute('aria-pressed')).toBe('false');
});
it('submits a mixed drag/tap draft exactly as staged during the warning',async()=>{
 const {container}=render(<PtownWordsView {...props} now={view.deadline-3000}/>);
 drag(screen.getByRole('button',{name:'C, 3 points'}),square(container,112));
 tap(screen.getByRole('button',{name:'A, 1 points'}));tap(square(container,113));
 expect(container.querySelector('.words-countdown')?.textContent).toBe('3');
 expect(intent).not.toHaveBeenCalled();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Submit Word'})));
 expect(intent).toHaveBeenCalledExactlyOnceWith({type:'place',items:[{tileId:1,square:112,letter:'C'},{tileId:2,square:113,letter:'A'}]});
});
it('renders the final ten seconds and offers one immediate cue per observed onset',()=>{
 const {container,rerender}=render(<PtownWordsView {...props} now={view.deadline-10001}/>);
 const warning=()=>container.querySelector('.words-countdown');
 expect(warning()).toBeNull();
 for(let second=10;second>=1;second--){
  vi.setSystemTime(view.deadline-second*1000);
  rerender(<PtownWordsView {...props} now={Date.now()}/>);
  expect(warning()?.textContent).toBe(String(second));
  expect(warning()?.getAttribute('data-tone')).toBe(second<=3?'urgent':second<=5?'warning':'neutral');
  rerender(<PtownWordsView {...props} now={Date.now()+100}/>);
 }
 expect(countdownSound.mock.calls.map(([event])=>event.id.split(':').at(-1))).toEqual(['10','9','8','7','6','5','4','3','2','1']);
 rerender(<PtownWordsView {...props} now={view.deadline}/>);
 expect(warning()).toBeNull();expect(screen.getByRole('button',{name:'C, 3 points'})).toHaveProperty('disabled',true);
 expect(intent).not.toHaveBeenCalled();
});
it('skips elapsed audio on resync, remount and return from the background',()=>{
 const ui=render(<PtownWordsView {...props} now={view.deadline-5000}/>);
 expect(ui.container.querySelector('.words-countdown')?.textContent).toBe('5');
 expect(countdownSound).not.toHaveBeenCalled();
 ui.rerender(<PtownWordsView {...props} now={view.deadline-3000}/>);
 expect(countdownSound).not.toHaveBeenCalled();
 act(()=>document.dispatchEvent(new Event('visibilitychange')));
 ui.rerender(<PtownWordsView {...props} now={view.deadline-2000}/>);
 expect(countdownSound).not.toHaveBeenCalled();
 ui.rerender(<PtownWordsView {...props} now={view.deadline-1000}/>);
 expect(countdownSound).toHaveBeenCalledOnce();
 ui.unmount();
 const rejoined=render(<PtownWordsView {...props} now={view.deadline-500}/>);
 expect(rejoined.container.querySelector('.words-countdown')?.textContent).toBe('1');expect(countdownSound).toHaveBeenCalledOnce();
});
it('uses only the entered Async play deadline and retires the warning on a bank, pause, handoff or ended phase',()=>{
 const now=view.deadline-5000,timed={...bankView,playDeadline:view.deadline,availabilityDeadline:view.deadline+129600000};
 const {container,rerender}=render(<PtownWordsView {...props} view={timed} asyncDraftUserId="u1" now={now}/>);
 const warning=()=>container.querySelector('.words-countdown');
 expect(warning()?.textContent).toBe('5');
 rerender(<PtownWordsView {...props} view={{...timed,playDeadline:view.deadline+180000,deadline:view.deadline+180000,timeBankSpent:{me:[0]}}} asyncDraftUserId="u1" now={now}/>);
 expect(warning()).toBeNull();
 for(const stopped of [{...timed,playDeadline:null},{...timed,playDeadline:undefined},{...timed,paused:true},{...timed,phase:'complete' as const,finished:true},{...timed,deadline:view.deadline+180000,playDeadline:null,turn:2,activePlayerId:'other',canAct:false}]){
  rerender(<PtownWordsView {...props} view={stopped} asyncDraftUserId="u1" now={now}/>);
  expect(warning()).toBeNull();
 }
 expect(countdownSound).not.toHaveBeenCalled();
});

it.each(['me','other'])('reserves both Last labels and changes only the scorer on landing (%s)',viewerId=>{
 const move=(turn:number,playerId:string,word:string,points:number)=>({turn,playerId,action:'place' as const,words:[{word,points}],points,count:word.length});
 const scored={...view,viewerId,turn:4,scores:{me:10,other:8},moves:[move(1,'me','AT',4),move(2,'other','CAT',8),move(3,'me','HIM',6)],movePresentation:{version:1 as const,turn:3,playerId:'me',squares:[112,113,114],startedAt:1000,focusMs:200,flipMs:260,announceAt:1980,noticeMs:1600,readyAt:6000}} as WordsSnapshot;
 const ui=render(<PtownWordsView {...props} view={scored} now={2100}/>);
 const label=(id:string)=>ui.container.querySelector('[data-score-player="'+id+'"] .words-last')?.textContent;
 expect(label('me')).toBe('');expect(label('other')).toBe('Last: CAT (8)');
 expect(ui.container.querySelector('[data-score-player="me"] strong')?.textContent).toBe('4');
 ui.rerender(<PtownWordsView {...props} view={scored} now={4000}/>);
 expect(label('me')).toBe('Last: HIM (6)');expect(label('other')).toBe('Last: CAT (8)');expect(ui.container.querySelector('[data-score-player="me"] strong')?.textContent).toBe('10');
 ui.rerender(<PtownWordsView {...props} view={{...scored,turn:5,movePresentation:undefined,moves:[...scored.moves,{turn:4,playerId:'other',action:'pass',points:0,words:[],count:0} as WordsSnapshot['moves'][number]]}} now={5000}/>);
 expect(label('me')).toBe('Last: HIM (6)');expect(label('other')).toBe('Last: PASS');
});

it.each([['pass',undefined,0,'Pat passed'],['pass','timeout',0,'Pat timed out'],['exchange',undefined,5,'Pat exchanged 5 tiles']] as const)('shows a recorded %s before admitting the async clock',async(action,reason,count,title)=>{
 const v={...view,turn:2,playDeadline:null,moves:[{turn:1,playerId:'other',action,reason,count,points:0,words:[]}]};
 const ui=render(<PtownWordsView {...props} view={v} asyncDraftUserId="u1"/>);
 expect(screen.getByRole('dialog',{name:title})).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});expect(intent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(2100);});expect(intent).toHaveBeenCalledWith({type:'begin_turn'});
 ui.unmount();render(<PtownWordsView {...props} view={v} asyncDraftUserId="u1"/>);expect(screen.queryByRole('dialog')).toBeNull();
});
