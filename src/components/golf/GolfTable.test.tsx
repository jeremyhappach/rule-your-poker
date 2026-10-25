// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
const state=vi.hoisted(()=>({game:{} as any,move:null as any,layer:null as HTMLElement|null,act:vi.fn(),emit:vi.fn(),dismiss:vi.fn()}));
vi.mock('@/hooks/useGolf',()=>({useGolf:()=>state.game}));
vi.mock('@/lib/golf/client',()=>({golfTransport:()=>({}),golfRpc:vi.fn()}));
vi.mock('./useGolfFinancial',()=>({useGolfFinancial:()=>true}));
vi.mock('./useGolfCardPresentation',()=>({useGolfCardPresentation:()=>({move:state.move,busy:!!state.move,card:(id:string,i:number)=>state.game.snapshot.tableaus[id].cards[i],pending:state.game.snapshot.pending,pendingBack:false,discard:state.game.snapshot.discardTop})}));
vi.mock('@/lib/canonicalShell/TableauCard',()=>({TableauCard:({isHidden,tier}:any)=><span data-face={isHidden?'back':'public'} data-tier={tier}/>}));
vi.mock('@/lib/canonicalShell/ShellOwnedFeltHost',()=>({usePublishShellFelt:()=>{}}));
vi.mock('@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement',()=>({useCanonicalFeltInteractionLayerElement:()=>state.layer}));
vi.mock('@/lib/canonicalShell/ShellHudGrid',()=>({ShellHudGrid:({pane,identity}:any)=><><div data-hud-row="pane">{pane}</div><div data-hud-row="identity">{identity}</div></>}));
vi.mock('@/lib/canonicalShell/ShellTimerRail',()=>({useShellTimer:()=>{},ShellTimerRail:()=>null}));
vi.mock('@/lib/canonicalShell/ShellTabBar',()=>({useShellTabBar:()=>{}}));
vi.mock('@/lib/canonicalShell/GameplayOpponentSeatLayer',()=>({GameplayOpponentSeatLayer:({participants,presentation}:any)=><>{participants.map((p:any)=><button key={p.id} aria-label={'View '+p.name+' tableau'} onClick={()=>presentation.onInspectTableau?.(p)}/>)}</>}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:state.emit,dismiss:state.dismiss})}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({allMessages:[],sendMessage:()=>{}})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
vi.mock('@/lib/canonicalShell/PresentationChipBalance',()=>({PresentationChipBalance:()=>null}));
vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:()=>{}}));
vi.mock('@/components/TurnSpotlight',()=>({TurnSpotlight:()=>null}));
vi.mock('@/lib/canonicalShell/CanonicalPlayerIdentityRow',()=>({CanonicalPlayerIdentityRow:()=>null}));
import {GolfTable} from './GolfTable';
const props={dealerGameId:'d',userId:'u',activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:vi.fn(),onTerminalComplete:vi.fn()};
const snapshot=()=>({id:'d',scope:'r',identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},rules:{version:'six-card-golf/1',turnSeconds:30,holes:9},revision:1,viewerId:'p',players:[{id:'p',userId:'u',name:'You',seat:4,isBot:false,chips:0},{id:'q',userId:'v',name:'Opponent',seat:7,isBot:false,chips:0}],tableaus:{p:{cards:Array(6).fill(null),exposed:Array(6).fill(false)},q:{cards:Array(6).fill(null),exposed:Array(6).fill(false)}},scores:{p:0,q:0},holes:[],phase:'opening',hole:1,turnIndex:0,dealerIndex:1,deadline:30000,paused:false,canAct:true,settled:false,pending:null,hasPending:false,consecutiveNoRevealTurns:0,finalQueue:[],finalReason:null,playerControls:{p:{autoPlay:false,intentVersion:0,sitOutNextHand:false}}} as unknown as GolfSnapshot);
beforeEach(()=>{state.move=null;state.act.mockReset();state.emit.mockReset();state.dismiss.mockReset();state.game={snapshot:snapshot(),connected:true,pending:false,now:1000,epoch:0,act:state.act,reconnect:vi.fn()};state.layer=document.createElement('div');document.body.append(state.layer);});
afterEach(()=>{cleanup();state.layer?.remove();});
const card=(n:number)=>document.querySelector('[data-golf-position="'+n+'"]') as HTMLButtonElement;
it('only the separate discard pill rejects a legal pending stock draw',()=>{
 state.game.snapshot={...state.game.snapshot,phase:'playing',hasPending:true,pending:{actor:'p',card:8}};
 const ui=render(<GolfTable {...props}/>);fireEvent.click(document.querySelector('[data-golf-pending]')!);expect(state.act).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Discard drawn card'}));expect(state.act).toHaveBeenCalledExactlyOnceWith({type:'reject'});
 state.game.pending=true;ui.rerender(<GolfTable {...props}/>);expect(screen.queryByRole('button',{name:'Discard drawn card'})).toBeNull();
});
it('marks a concealed first selection and submits exactly the two tapped positions',()=>{
 render(<GolfTable {...props}/>);fireEvent.click(card(0));expect(card(0).getAttribute('aria-pressed')).toBe('true');expect(card(0).querySelector('.golf-selection')).not.toBeNull();expect(state.act).not.toHaveBeenCalled();
 fireEvent.click(card(3));expect(state.act).toHaveBeenCalledExactlyOnceWith({type:'open',items:[0,3]});
 expect(card(0).closest('[data-hud-row="pane"]')).not.toBeNull();expect(state.layer!.querySelector('[data-golf-position]')).toBeNull();
});
it('allows deselecting the first card without sending or revealing it',()=>{
 render(<GolfTable {...props}/>);fireEvent.click(card(2));fireEvent.click(card(2));expect(state.act).not.toHaveBeenCalled();expect(card(2).getAttribute('aria-pressed')).toBe('false');
 fireEvent.click(card(1));fireEvent.click(card(5));expect(state.act).toHaveBeenCalledExactlyOnceWith({type:'open',items:[1,5]});
});
it.each(['paused','opponent','disconnected','pending','expired'])('does not bypass %s authority',reason=>{
 if(reason==='paused')state.game.snapshot.paused=true;
 if(reason==='opponent')state.game.snapshot.canAct=false;
 if(reason==='disconnected')state.game.connected=false;
 if(reason==='pending')state.game.pending=true;
 if(reason==='expired')state.game.now=30000;
 render(<GolfTable {...props}/>);fireEvent.click(card(0));fireEvent.click(card(3));expect(card(0).disabled).toBe(true);expect(state.act).not.toHaveBeenCalled();
});
it('explains paused autoplay and preserves the public-only board',()=>{
 state.game.snapshot.paused=true;state.game.snapshot.playerControls.p.autoPlay=true;
 render(<GolfTable {...props}/>);expect(screen.getByRole('status').textContent).toContain('uncheck Auto-play to rejoin');expect(document.querySelectorAll('[data-face="back"]')).toHaveLength(8);
 expect(state.layer!.querySelectorAll('[data-golf-public-tableau]')).toHaveLength(0);
 expect(document.querySelector('.golf-pane .golf-controls')).toBeNull();
 expect(screen.getByRole('checkbox',{name:'Auto-play'}).closest('.golf-pane')).not.toBeNull();expect(screen.queryByRole('button',{name:'Table information'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'View Opponent tableau'}));expect(document.querySelectorAll('.golf-inspect [data-face="back"]')).toHaveLength(6);
});
it('preserves an unfinished opening selection when a peer commits',()=>{
 const ui=render(<GolfTable {...props}/>);fireEvent.click(card(0));state.game.snapshot={...state.game.snapshot,revision:2,turnIndex:1};ui.rerender(<GolfTable {...props}/>);expect(card(0).getAttribute('aria-pressed')).toBe('true');
});

it('opens the existing redacted tableau from the seat indicator, not the felt cards',()=>{
 state.game.snapshot.phase='playing';state.game.snapshot.turnIndex=1;state.game.snapshot.canAct=false;
 state.game.snapshot.tableaus.q={cards:[0,null,12,null,null,null],exposed:[true,false,true,false,false,false]};
 render(<GolfTable {...props}/>);
 const felt=state.layer!.querySelector('.golf-public-cards')!;
 expect(felt.tagName).toBe('DIV');fireEvent.click(felt);
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'View Opponent tableau'}));
 expect(screen.getByRole('dialog').textContent).toContain('Opponent · public tableau');
 expect(document.querySelectorAll('.golf-inspect [data-face="back"]')).toHaveLength(4);
 expect(document.querySelectorAll('.golf-inspect [data-face="public"]')).toHaveLength(2);
 expect(state.act).not.toHaveBeenCalled();
});

it.each([50,null])('uses the viewer medium face tier for opponent and displaced cards, retaining concealment (%s)',old=>{
 state.game.snapshot.phase='playing';state.game.snapshot.turnIndex=1;state.game.snapshot.canAct=false;
 state.game.snapshot.tableaus.q={cards:[50,null,12,null,null,null],exposed:[true,false,true,false,false,false]};
 state.move={actor:'q',index:0,stage:'landed',before:{tableaus:{q:{cards:[old,null,12,null,null,null]}}}};
 render(<GolfTable {...props}/>);
 const faces=document.querySelectorAll('.golf-local [data-tier],.golf-public-grid [data-tier]');
 expect(faces.length).toBeGreaterThan(12);expect([...faces].every(e=>e.getAttribute('data-tier')==='medium')).toBe(true);
 expect(document.querySelector('[data-golf-displaced] [data-face]')?.getAttribute('data-face')).toBe(old===null?'back':'public');
 expect(document.querySelectorAll('.golf-public-grid [data-face="back"]')).toHaveLength(old===null?5:4);
 expect(state.act).not.toHaveBeenCalled();
});
it('cold result mount shows authoritative totals without replaying a hand',()=>{
 state.game.snapshot.phase='hole_complete';state.game.snapshot.canAct=false;
 state.game.snapshot.tableaus.q.cards=[0,1,2,3,4,5];state.game.snapshot.tableaus.p.cards=[6,7,8,9,10,11];
 state.game.snapshot.holes=[{hole:1,roundId:'r',scores:{p:3,q:7}}];
 render(<GolfTable {...props}/>);
 expect(state.layer!.querySelector('[data-golf-stock]')).toBeNull();
 expect(state.layer!.querySelectorAll('.golf-scoring-hand [data-card-anchor]')).toHaveLength(0);
 expect(screen.getByRole('region',{name:'Nine-hole scorecard'})).not.toBeNull();expect(screen.queryByText('Results')).toBeNull();
});
it('places discard before stock and exposes the stock count through its accessible label',()=>{
 state.game.snapshot.stockCount=39;render(<GolfTable {...props}/>);
 const stock=screen.getByRole('button',{name:'Draw stock, 39 cards'});
 expect(document.querySelector('.golf-piles')!.firstElementChild!.hasAttribute('data-golf-discard')).toBe(true);
 expect(stock.textContent).toBe('39');
 expect(stock.querySelector('[data-card-anchor="stock"] [data-canonical-card-count]')?.getAttribute('aria-hidden')).toBe('true');
 expect(screen.queryByText(/^Stock\b/)).toBeNull();
});

it('scopes persistent opponent announcements to the canonical session provider',()=>{
 state.game.snapshot.phase='playing';state.game.snapshot.turnIndex=1;state.game.snapshot.canAct=false;
 render(<GolfTable {...props}/>);
 expect(state.emit).toHaveBeenCalledWith(expect.objectContaining({behavior:'ambient',scope:{dealerGameId:'s',roundId:'r'},payload:{title:'Opponent is playing'}}));
});

it('retires Final turns at the scoring boundary, without reviving turn controls',()=>{
 const v=state.game.snapshot;v.phase='playing';v.finalReason='six_exposed';v.finalQueue=['q'];
 const ui=render(<GolfTable {...props}/>);
 state.game.snapshot={...v,phase:'hole_complete',finalQueue:[],revision:2,deadline:7000,holes:[{hole:1,roundId:'r',scores:{p:3,q:7}}],tableaus:{p:{cards:[0,1,2,3,4,5],exposed:Array(6).fill(true)},q:{cards:[6,7,8,9,10,11],exposed:Array(6).fill(true)}}};
 ui.rerender(<GolfTable {...props}/>);
 expect(state.dismiss).toHaveBeenCalledWith('golf-final:r');expect(screen.getByRole('status').textContent).not.toContain('Final turns');
 expect(state.layer!.querySelector('.golf-piles')).toBeNull();
});

it('shows the scoring player and running hole subtotal in the active-player helper',()=>{
 state.game.snapshot.phase='playing';const ui=render(<GolfTable {...props}/>);
 state.game.snapshot={...state.game.snapshot,phase:'hole_complete',canAct:false,deadline:17000,rules:{...state.game.snapshot.rules,holeResultSeconds:16},scores:{p:200,q:300},holes:[{hole:1,roundId:'r',scores:{p:21,q:20}}],tableaus:{p:{cards:[1,10,12,14,9,0],exposed:Array(6).fill(true)},q:{cards:[3,8,10,5,21,12],exposed:Array(6).fill(true)}}};
 const check=(now:number,text:string)=>{state.game.now=now;ui.rerender(<GolfTable {...props}/>);expect(screen.getByRole('status').textContent).toBe(text);};
 check(1000,'Scoring Opponent/Hole 1: E');
 check(1800,'Scoring Opponent/Hole 1: +4');
 check(2450,'Scoring Opponent/Hole 1: +10');
 check(3100,'Scoring Opponent/Hole 1: +10');
 expect(state.layer!.querySelectorAll('.golf-score-highlight')).toHaveLength(2);
 check(7200,'Scoring You/Hole 1: E');
});

it('keeps FINAL TURN on the felt through pauses and removes it at completion',()=>{
 state.game.snapshot.phase='playing';state.game.snapshot.finalQueue=['q'];state.game.snapshot.finalReason='six_exposed';const ui=render(<GolfTable {...props}/>);
 expect(state.layer!.querySelector('.golf-final-turn')?.textContent).toBe('FINAL TURN');state.game.snapshot.paused=true;ui.rerender(<GolfTable {...props}/>);expect(state.layer!.querySelector('.golf-final-turn')).not.toBeNull();
 state.game.snapshot.phase='hole_complete';ui.rerender(<GolfTable {...props}/>);expect(state.layer!.querySelector('.golf-final-turn')).toBeNull();expect(screen.queryByRole('button',{name:/^Close$/})).toBeNull();
});

it('replaces partial helpers with a completed-hole leaderboard and an accessible scorecard',()=>{
 render(<GolfTable {...props}/>);expect(document.querySelector('.golf-score-pill')).toBeNull();expect(screen.getByRole('img',{name:'Hole 1'})).not.toBeNull();
 const rows=document.querySelectorAll('.golf-leaderboard tbody tr');expect(rows).toHaveLength(2);expect(rows[0].textContent).toBe('YouE');
 fireEvent.click(screen.getByRole('button',{name:'Open nine-hole scorecard'}));expect(screen.getByRole('region',{name:'Nine-hole scorecard'})).not.toBeNull();
 expect(document.querySelectorAll('.golf-scorecard thead th')).toHaveLength(11);
});

it('shows the final scorecard only at the winner hold and retires it for Session Ended',()=>{
 state.game.snapshot={...state.game.snapshot,phase:'complete',settled:true,finished:false,financial:{resultId:'result'},terminal:{resultId:'result',winnerIds:['p','q'],score:0,startedAt:2000,deadline:60000},holes:Array.from({length:9},(_,i)=>({hole:i+1,roundId:'r'+i,scores:{p:0,q:0}}))};
 const ui=render(<GolfTable {...props}/>);expect(props.onTerminalActive).toHaveBeenCalledWith(true);expect(document.querySelector('.golf-final-scorecard')).toBeNull();
 state.game.now=2000;ui.rerender(<GolfTable {...props}/>);expect(document.querySelector('.golf-final-scorecard')).not.toBeNull();expect(state.emit).toHaveBeenCalledWith(expect.objectContaining({type:'match_win'}));
 ui.rerender(<GolfTable {...props} sessionEnded/>);expect(document.querySelector('.golf-final-scorecard')).toBeNull();expect(document.querySelector('.golf-hole-flag')).toBeNull();
});

import {golfRpc} from '@/lib/golf/client';

it('shows only an authoritative checked rejoin control directly in the active player area',async()=>{
 const ui=render(<GolfTable {...props}/>);expect(screen.queryByRole('checkbox',{name:'Auto-play'})).toBeNull();
 state.game.snapshot={...state.game.snapshot,playerControls:{p:{autoPlay:true,intentVersion:7,sitOutNextHand:true}}};
 ui.rerender(<GolfTable {...props}/>);const checkbox=screen.getByRole('checkbox',{name:'Auto-play'}) as HTMLInputElement;
 expect(checkbox.checked).toBe(true);expect(checkbox.closest('[data-hud-row="pane"]')).not.toBeNull();
 vi.mocked(golfRpc).mockResolvedValueOnce({} as never);fireEvent.click(checkbox);
 await waitFor(()=>expect(golfRpc).toHaveBeenCalledWith('golf_reclaim_control',{p_dealer_game_id:'d',p_round_id:'r',p_expected_version:7}));
 await waitFor(()=>expect(state.game.reconnect).toHaveBeenCalled());
 state.game.snapshot={...state.game.snapshot,playerControls:{p:{autoPlay:false,intentVersion:8,sitOutNextHand:false}}};state.game.epoch++;
 ui.rerender(<GolfTable {...props}/>);expect(screen.queryByRole('checkbox',{name:'Auto-play'})).toBeNull();
});
it('retains final-move anchors, then hides stale stock/discard throughout the configured scoring delay',()=>{
 state.game.snapshot={...state.game.snapshot,phase:'playing',turnIndex:1,canAct:false};
 const before=state.game.snapshot,ui=render(<GolfTable {...props}/>);
 const result={...before,revision:2,phase:'hole_complete',turnIndex:0,canAct:true,finalQueue:[],rules:{...before.rules,presentation:{version:1,scoringDelayMs:1200,resultsDurationMs:5000}},presentation:{version:1,startedAt:1000,resultsAt:20000,endsAt:25000,hidden:{}},holes:[{hole:1,roundId:'r',scores:{p:3,q:7}}],tableaus:{p:{cards:[0,1,2,3,4,5],exposed:Array(6).fill(true)},q:{cards:[6,7,8,9,10,11],exposed:Array(6).fill(true)}}};
 state.game.snapshot=result;state.move={actor:'q',index:0,stage:'arrived',before,after:result};ui.rerender(<GolfTable {...props}/>);
 expect(state.layer!.querySelector('.golf-piles')).not.toBeNull();expect(state.layer!.querySelector('[data-viewer-turn]')).toBeNull();
 state.move=null;ui.rerender(<GolfTable {...props}/>);
 expect(state.layer!.querySelector('.golf-piles')?.getAttribute('data-golf-retired')).toBe('true');expect(state.layer!.querySelector('[data-viewer-turn]')).toBeNull();expect(state.layer!.querySelector('.golf-scoring-hand')).toBeNull();
 state.game.now=2199;ui.rerender(<GolfTable {...props}/>);expect(state.layer!.querySelector('.golf-scoring-hand')).toBeNull();
 state.game.now=2200;ui.rerender(<GolfTable {...props}/>);expect(state.layer!.querySelector('.golf-scoring-hand')).not.toBeNull();expect(state.act).not.toHaveBeenCalled();
});

it('leaves a not-yet-released history score blank',()=>{
 state.game.snapshot={...state.game.snapshot,phase:'playing',holes:[{hole:1,roundId:'prior',scores:{p:4}}]};
 render(<GolfTable {...props} activeTab="history"/>);
 expect(document.querySelector('.golf-panel')?.textContent).toBe('Hole 1: You +4 · Opponent ');
});
