// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
const state=vi.hoisted(()=>({game:{} as any,layer:null as HTMLElement|null,act:vi.fn()}));
vi.mock('@/hooks/useGolf',()=>({useGolf:()=>state.game}));
vi.mock('@/lib/golf/client',()=>({golfTransport:()=>({}),golfRpc:vi.fn()}));
vi.mock('./useGolfFinancial',()=>({useGolfFinancial:()=>true}));
vi.mock('./useGolfCardPresentation',()=>({useGolfCardPresentation:()=>new Map()}));
vi.mock('@/lib/canonicalShell/TableauCard',()=>({TableauCard:({isHidden}:any)=><span data-face={isHidden?'back':'public'}/>}));
vi.mock('@/lib/canonicalShell/ShellOwnedFeltHost',()=>({usePublishShellFelt:()=>{}}));
vi.mock('@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement',()=>({useCanonicalFeltInteractionLayerElement:()=>state.layer}));
vi.mock('@/lib/canonicalShell/ShellHudGrid',()=>({ShellHudGrid:({pane,identity}:any)=><><div data-hud-row="pane">{pane}</div><div data-hud-row="identity">{identity}</div></>}));
vi.mock('@/lib/canonicalShell/ShellTimerRail',()=>({useShellTimer:()=>{},ShellTimerRail:()=>null}));
vi.mock('@/lib/canonicalShell/ShellTabBar',()=>({useShellTabBar:()=>{}}));
vi.mock('@/lib/canonicalShell/GameplayOpponentSeatLayer',()=>({GameplayOpponentSeatLayer:()=>null}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:()=>{}})}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({allMessages:[],sendMessage:()=>{}})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
vi.mock('@/lib/canonicalShell/PresentationChipBalance',()=>({PresentationChipBalance:()=>null}));
vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:()=>{}}));
import {GolfTable} from './GolfTable';
const props={dealerGameId:'d',userId:'u',activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:vi.fn(),onTerminalComplete:vi.fn()};
const snapshot=()=>({id:'d',scope:'r',identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},rules:{version:'six-card-golf/1',turnSeconds:30,holes:9},revision:1,viewerId:'p',players:[{id:'p',userId:'u',name:'You',seat:4,isBot:false,chips:0},{id:'q',userId:'v',name:'Opponent',seat:7,isBot:false,chips:0}],tableaus:{p:{cards:Array(6).fill(null),exposed:Array(6).fill(false)},q:{cards:Array(6).fill(null),exposed:Array(6).fill(false)}},scores:{p:0,q:0},holes:[],phase:'opening',hole:1,turnIndex:0,dealerIndex:1,deadline:30000,paused:false,canAct:true,settled:false,pending:null,hasPending:false,consecutiveNoRevealTurns:0,finalQueue:[],finalReason:null,playerControls:{p:{autoPlay:false,intentVersion:0,sitOutNextHand:false}}} as unknown as GolfSnapshot);
beforeEach(()=>{state.act.mockReset();state.game={snapshot:snapshot(),connected:true,pending:false,now:1000,epoch:0,act:state.act};state.layer=document.createElement('div');document.body.append(state.layer);});
afterEach(()=>{cleanup();state.layer?.remove();});
const card=(n:number)=>document.querySelector('[data-golf-position="'+n+'"]') as HTMLButtonElement;
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
 render(<GolfTable {...props}/>);expect(screen.getByRole('status').textContent).toContain('Info for rejoin');expect(document.querySelectorAll('[data-face="back"]')).toHaveLength(13);
 expect(state.layer!.querySelectorAll('[data-golf-public-tableau]')).toHaveLength(1);
 expect(document.querySelector('.golf-pane .golf-controls')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Table information'}));expect(screen.getByRole('checkbox',{name:'Auto-play'})).not.toBeNull();expect(screen.getByText(/uncheck Auto-play to rejoin, then/)).not.toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'View Opponent · Total 0'}));expect(document.querySelectorAll('.golf-inspect [data-face="back"]')).toHaveLength(6);
});
it('clears an unfinished selection at a new authoritative revision',()=>{
 const ui=render(<GolfTable {...props}/>);fireEvent.click(card(0));state.game.snapshot={...state.game.snapshot,revision:2};ui.rerender(<GolfTable {...props}/>);expect(card(0).getAttribute('aria-pressed')).toBe('false');
});
it('retains opponent reveal anchors while presenting completed-hole results',()=>{
 state.game.snapshot.phase='hole_complete';state.game.snapshot.canAct=false;
 state.game.snapshot.tableaus.q.cards=[0,1,2,3,4,5];
 state.game.snapshot.holes=[{hole:1,scores:{p:3,q:7}}];
 render(<GolfTable {...props}/>);
 expect(state.layer!.querySelectorAll('[data-golf-public-tableau] [data-card-anchor]')).toHaveLength(6);
 expect(state.layer!.querySelectorAll('[data-golf-public-tableau] [data-face="public"]')).toHaveLength(6);
 expect(state.layer!.querySelector('[data-golf-stock]')).toBeNull();
 expect(screen.getByText('Hole 1 scored')).not.toBeNull();
});
it('places discard before stock and exposes the stock count through its accessible label',()=>{
 state.game.snapshot.stockCount=39;render(<GolfTable {...props}/>);
 const stock=screen.getByRole('button',{name:'Draw stock, 39 cards'});
 expect(document.querySelector('.golf-piles')!.firstElementChild!.hasAttribute('data-golf-discard')).toBe(true);
 expect(stock.textContent).toBe('39');
 expect(stock.querySelector('[data-card-anchor="stock"] [data-canonical-card-count]')?.getAttribute('aria-hidden')).toBe('true');
 expect(screen.queryByText(/^Stock\b/)).toBeNull();
});
