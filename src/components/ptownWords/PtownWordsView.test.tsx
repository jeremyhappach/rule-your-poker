// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children,actions,scores}:any)=><div>{scores}{children}{actions}</div>}));
import {PtownWordsView} from './PtownWordsView';
import {shuffleRack,isInvalidWord} from '@/lib/ptownWords/rackPresentation';
const view={identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},revision:0,serverAt:1000,rules:{version:'ptown-words/1',dictionaryId:'enable2k/1',dictionarySha256:'hash',turnMs:180000},players:[{id:'me',userId:'u1',name:'You',seat:1,isBot:false},{id:'other',userId:'u2',name:'Pat',seat:2,isBot:true}],viewerId:'me',activePlayerId:'me',board:Array(225).fill(null),rack:[{id:1,face:'C',value:3},{id:2,face:'A',value:1},{id:3,face:'?',value:0}],scores:{me:0,other:0},turn:1,deadline:181000,canAct:true,paused:false,phase:'playing',bagCount:86,rackCounts:{me:3,other:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{me:100,other:100},resultId:null,batch:null},moves:[],event:{label:'Game started',points:0}} as WordsSnapshot;
const intent=vi.fn(async()=>true),props={view,now:1000,pending:false,connected:true,error:'',activeTab:'cards' as const,setActiveTab:vi.fn(),panel:null,sessionEnded:false,onIntent:intent,onReconnect:vi.fn()};
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});intent.mockReset();intent.mockResolvedValue(true);});afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function tap(cell:Element){fireEvent.click(cell,{detail:1,clientX:100,clientY:100});}
it('auto-places a blank after two draft tiles, and removing to one resets direction without rack zoom',()=>{
 const {container}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);
 fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);
 fireEvent.click(screen.getByRole('button',{name:'A, 1 points'}));fireEvent.click(container.querySelector('[data-square="113"]')!);
 const zoom=container.querySelector('.words-board')?.className;
 fireEvent.click(screen.getByRole('button',{name:'Blank, 0 points'}));expect(screen.getByRole('dialog')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'T'}));
 expect(container.querySelector('[data-square="114"]')?.textContent).toContain('T');expect(container.querySelectorAll('.is-staged')).toHaveLength(3);expect(container.querySelector('.words-board')?.className).toBe(zoom);expect(intent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));fireEvent.click(screen.getByRole('button',{name:'Undo'}));fireEvent.click(screen.getByRole('button',{name:'A, 1 points'}));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
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
it.each(['mouse','touch'])('%s rack input selects without zoom; only direct board input zooms then places',pointerType=>{
 const {container}=render(<PtownWordsView {...props}/>),rack=screen.getByRole('button',{name:'C, 3 points'}),cell=container.querySelector('[data-square="112"]')!;
 fireEvent.pointerDown(rack,{pointerType});fireEvent.click(rack,{detail:1});expect(rack.getAttribute('aria-pressed')).toBe('true');expect(container.querySelector('.is-overview')).not.toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 fireEvent.pointerDown(cell,{pointerType});tap(cell);act(()=>vi.advanceTimersByTime(301));expect(container.querySelector('.is-zoom')).not.toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
 const scroll=container.querySelector('.words-scroll')!;scroll.scrollLeft=37;scroll.scrollTop=49;fireEvent.click(rack);fireEvent.click(rack);expect(scroll.scrollLeft).toBe(37);expect(scroll.scrollTop).toBe(49);expect(container.querySelector('.is-zoom')).not.toBeNull();
 fireEvent.pointerDown(cell,{pointerType});tap(cell);act(()=>vi.advanceTimersByTime(301));expect(scroll.getAttribute('data-zoom')).toBe('2');tap(cell);act(()=>vi.advanceTimersByTime(301));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);expect(intent).not.toHaveBeenCalled();
});
it('double-tap zooms out without placing, returning a staged tile, or submitting',()=>{
 const {container}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));const cell=container.querySelector('[data-square="112"]')!;
 tap(cell);act(()=>vi.advanceTimersByTime(120));tap(cell);act(()=>vi.advanceTimersByTime(400));expect(container.querySelectorAll('.is-staged')).toHaveLength(0);expect(screen.getByRole('button',{name:'C, 3 points'}).getAttribute('aria-pressed')).toBe('true');expect(screen.queryByRole('button',{name:'Zoom Out'})).toBeNull();
 fireEvent.click(cell);tap(cell);act(()=>vi.advanceTimersByTime(301));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
 tap(cell);act(()=>vi.advanceTimersByTime(120));tap(cell);act(()=>vi.advanceTimersByTime(400));expect(container.querySelectorAll('.is-staged')).toHaveLength(1);expect(intent).not.toHaveBeenCalled();
 expect([...container.querySelectorAll('.words-turn-actions button')].map(b=>b.textContent)).toEqual(['Undo','Recall']);expect(screen.getByRole('button',{name:'Submit Word'}).parentElement?.className).toBe('words-player');
});
it('double-tapping with a blank selected never opens its letter picker',()=>{const {container}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'Blank, 0 points'}));const cell=container.querySelector('[data-square="112"]')!;tap(cell);act(()=>vi.advanceTimersByTime(100));tap(cell);act(()=>vi.advanceTimersByTime(400));expect(screen.queryByRole('dialog')).toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);});
it('a new turn cancels a pending tap before it can alter a draft',()=>{const {container,rerender}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));tap(container.querySelector('[data-square="112"]')!);rerender(<PtownWordsView {...props} view={{...view,turn:2,canAct:false,activePlayerId:'other'}}/>);act(()=>vi.advanceTimersByTime(400));expect(container.querySelectorAll('.is-staged')).toHaveLength(0);});
it('uses board taps for zoom without redundant board-size or zoom controls',()=>{
 const {container}=render(<PtownWordsView {...props}/>);
 expect(container.textContent).not.toMatch(/15\s*×\s*15/);expect(screen.queryByRole('button',{name:'Zoom In'})).toBeNull();
 fireEvent.click(container.querySelector('[data-square="112"]')!);expect(container.querySelector('.is-zoom')).not.toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(0);
});
it('keeps the draft and zoom while submitting and after server rejection',async()=>{
 let reply!:(value:boolean)=>void;intent.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{reply=resolve;}));
 const {container}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);
 fireEvent.click(screen.getByRole('button',{name:'Submit Word'}));expect(container.querySelector('.is-zoom')).not.toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
 await act(async()=>reply(false));expect(container.querySelector('.is-zoom')).not.toBeNull();expect(container.querySelectorAll('.is-staged')).toHaveLength(1);
});
const ownMove={turn:1,playerId:'me',action:'place' as const,points:4,count:2,words:[{word:'CA',points:4,square:112,direction:1}]};
const accepted={...view,turn:2,moves:[ownMove],canAct:false,activePlayerId:'other'};
const opponent={...view,turn:3,moves:[ownMove,{...ownMove,turn:2,playerId:'other'}],movePresentation:{version:1 as const,turn:2,playerId:'other',squares:[127,128],startedAt:1100,announceAt:1820,readyAt:3770,flipMs:260,focusMs:200,noticeMs:1600}};
it('zooms out on authoritative acceptance and restores overview after the opponent reveal',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);expect(container.querySelector('.is-zoom')).not.toBeNull();
 rerender(<PtownWordsView {...props} view={accepted}/>);expect(container.querySelector('.is-overview')).not.toBeNull();
 rerender(<PtownWordsView {...props} view={opponent} now={1200}/>);expect(container.querySelector('.is-zoom')).not.toBeNull();
 rerender(<PtownWordsView {...props} view={opponent} now={4000}/>);expect(container.querySelector('.is-overview')).not.toBeNull();
});
it('handles acceptance and opponent reveal arriving together without restoring the old zoom',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);
 rerender(<PtownWordsView {...props} view={opponent} now={1200}/>);expect(container.querySelector('.is-zoom')).not.toBeNull();
 rerender(<PtownWordsView {...props} view={opponent} now={4000}/>);expect(container.querySelector('.is-overview')).not.toBeNull();
});
it('shows each dictionary rejection for 1500ms without discarding draft/camera or resetting the clock',()=>{
 const {container,rerender}=render(<PtownWordsView {...props}/>);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(container.querySelector('[data-square="112"]')!);fireEvent.click(screen.getByRole('button',{name:'C, 3 points'}));fireEvent.click(container.querySelector('[data-square="112"]')!);
 rerender(<PtownWordsView {...props} error="ptown_words:invalid_word:CC" errorVersion={1}/>);expect(screen.getByRole('alert').textContent).toBe('invalid word');
 act(()=>vi.advanceTimersByTime(1499));expect(screen.getByRole('alert')).not.toBeNull();act(()=>vi.advanceTimersByTime(1));expect(screen.queryByRole('alert')).toBeNull();
 rerender(<PtownWordsView {...props} now={3000} error="ptown_words:invalid_word:CC" errorVersion={2}/>);expect(screen.getByRole('alert')).not.toBeNull();expect(container.querySelector('time')?.textContent).toBe('2:58');
 expect(container.querySelectorAll('.is-staged')).toHaveLength(1);expect(container.querySelector('.is-zoom')).not.toBeNull();
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

it('defers overview taps, caps three scales, and never places on a double tap',()=>{const {container}=render(<PtownWordsView {...props}/>),cell=container.querySelector('[data-square="112"]')!,level=()=>container.querySelector('.words-scroll')!.getAttribute('data-zoom');tap(cell);expect(level()).toBe('0');act(()=>vi.advanceTimersByTime(100));tap(cell);act(()=>vi.advanceTimersByTime(350));expect(level()).toBe('0');for(const expected of ['1','2','2']){tap(cell);act(()=>vi.advanceTimersByTime(301));expect(level()).toBe(expected);}for(const expected of ['1','0','0']){tap(cell);act(()=>vi.advanceTimersByTime(100));tap(cell);act(()=>vi.advanceTimersByTime(350));expect(level()).toBe(expected);}expect(container.querySelectorAll('.is-staged')).toHaveLength(0);});
it('a drag cancels a pending board tap without changing scale',()=>{const {container}=render(<PtownWordsView {...props}/>),cell=container.querySelector('[data-square="112"]')!;tap(cell);fireEvent.scroll(container.querySelector('.words-scroll')!);act(()=>vi.advanceTimersByTime(350));expect(container.querySelector('.words-scroll')!.getAttribute('data-zoom')).toBe('0');});
