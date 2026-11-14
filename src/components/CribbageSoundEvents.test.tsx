// @vitest-environment jsdom
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CribbagePegBoard} from './CribbagePegBoard';
import {CribbageCountingPhase} from './CribbageCountingPhase';
import type {CribbageState} from '@/lib/cribbageTypes';
const audio=vi.hoisted(()=>({play:vi.fn()}));
vi.mock('@/lib/cribbage/sounds',async original=>({...await original<object>(),presentCribbageScore:audio.play}));
vi.mock('@/lib/debugEventLogger',()=>({logDebugEvent:vi.fn()}));
vi.mock('@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider',()=>({useCribbageGameplayGeometry:()=>({placementsById:new Map(),lastValidPlacementsById:new Map()})}));
vi.mock('@/lib/wave4LayoutResolver/useLiveGeometryConstraints',()=>({useLiveGeometryConstraints:()=>({vminInPx:3.9})}));
vi.mock('@/lib/geometryLab/cardArtifactOverlap',()=>({useCardOverlap:()=>0}));
vi.mock('./CribbagePlayingCard',()=>({CribbagePlayingCard:({card}:any)=><span>{card?.rank}{card?.suit}</span>}));
const players=[{id:'p1',user_id:'u1',position:0,profiles:{username:'One'}},{id:'p2',user_id:'u2',position:1,profiles:{username:'Two'}}];
const cards=[{rank:'2',suit:'clubs'},{rank:'2',suit:'hearts'},{rank:'8',suit:'clubs'},{rank:'8',suit:'hearts'}];
const state={phase:'counting',turnOrder:['p1','p2'],dealerPlayerId:'p2',crib:[],cutCard:{rank:'K',suit:'spades'},
 playerStates:{p1:{pegScore:4},p2:{pegScore:0}},pegging:{playedCards:cards.map(card=>({playerId:'p1',card}))}} as unknown as CribbageState;
const timing = { frame: {gameId:'g',dealerGameId:'d',roundId:'r',handNumber:1,pauseVersion:0,paused:false,state}, current:()=>true, elapsed:()=>0, releaseDelay:()=>0 };
beforeEach(()=>{vi.useFakeTimers();audio.play.mockReset();vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
const tick=async(ms:number)=>{for(let n=0;n<ms;n+=100)await act(async()=>{vi.advanceTimersByTime(100);});};

it('silently reconciles an outgoing six-point award after successor identity arrives',()=>{
 const props={players,winningScore:121,playerStates:{p1:{pegScore:106},p2:{pegScore:0}} as any};
 const ui=render(<CribbagePegBoard {...props} audioScope="old" overrideScores={{p1:100,p2:0}} audioActive={false}/>);
 ui.rerender(<CribbagePegBoard {...props} audioScope="next" overrideScores={{p1:100,p2:0}} audioActive={false}/>);
 ui.rerender(<CribbagePegBoard {...props} audioScope="next" audioActive/>);
 expect(audio.play.mock.calls.filter(c=>c[2]!==null)).toHaveLength(0);
 ui.rerender(<CribbagePegBoard {...props} audioScope="next" overrideScores={{p1:108,p2:0}} audioActive/>);
 expect(audio.play.mock.lastCall?.[0]).toBe(2);
 expect(audio.play.mock.lastCall?.[2]).not.toBeNull();
});

it.each([1,2,4,12])('sounds exactly the %i-point displayed award for either player without relying on CSS movement',points=>{
 const props={players,winningScore:121,playerStates:state.playerStates,audioScope:'game:round:hand',audioActive:true};
 const ui=render(<CribbagePegBoard {...props}/>);expect(audio.play).not.toHaveBeenCalled();
 ui.rerender(<CribbagePegBoard {...props} overrideScores={{p1:4+points,p2:0}}/>);
 expect(audio.play.mock.lastCall?.slice(0,2)).toEqual([points,'game:round:hand:p1:'+String(4+points)]);
 ui.rerender(<CribbagePegBoard {...props} overrideScores={{p1:4+points,p2:points}}/>);
 expect(audio.play.mock.lastCall?.slice(0,2)).toEqual([points,'game:round:hand:p2:'+points]);
 ui.rerender(<CribbagePegBoard {...props} overrideScores={{p1:4+points,p2:points}}/>);
 const peg=ui.container.querySelector<HTMLDivElement>('[style*="left:"]')!;
 fireEvent.transitionEnd(peg,{propertyName:'left'});expect(audio.play).toHaveBeenCalledTimes(2);
 ui.rerender(<CribbagePegBoard {...props} audioScope="next-hand" overrideScores={{p1:20,p2:20}}/>);
 expect(audio.play).toHaveBeenCalledTimes(2);
});
it('consumes hidden-tab awards and rebases after an interruption',()=>{
 const props={players,winningScore:121,playerStates:state.playerStates,audioScope:'scope',audioActive:true};
 const ui=render(<CribbagePegBoard {...props}/>);
 ui.rerender(<CribbagePegBoard {...props} audioActive={false} overrideScores={{p1:6,p2:0}}/>);
 expect(audio.play.mock.lastCall?.[2]).toBeNull();
 ui.rerender(<CribbagePegBoard {...props} overrideScores={{p1:6,p2:0}}/>);
 expect(audio.play).toHaveBeenCalledTimes(1);
 act(()=>window.dispatchEvent(new Event('offline')));
 ui.rerender(<CribbagePegBoard {...props} overrideScores={{p1:10,p2:2}}/>);
 expect(audio.play).toHaveBeenCalledTimes(1);
});
it('hand combinations award only their own points with no extra ding or total cue',async()=>{
 const props={cribbageState:state,players,cardBackColors:{color:'#123',darkColor:'#012'},onCountingComplete:vi.fn(),initialScores:{p1:0,p2:0},audioActive:true,debugContext:{gameId:'g',roundId:'r',userId:'u1',handNumber:1}};
 const ui=render(<CribbageCountingPhase countingTime={timing} {...props}/>);
 await tick(4100);
 for(let i=0;i<5;i++)ui.rerender(<CribbageCountingPhase countingTime={timing} {...props}/>);
 expect(audio.play.mock.calls.map(c=>c.slice(0,2))).toEqual([[2,'g:r:1:p1:0:0'],[2,'g:r:1:p1:0:1']]);
});
it('does not sound an already-highlighted persisted combo on reconnect',async()=>{
 render(<CribbageCountingPhase countingTime={timing} cribbageState={state} players={players} cardBackColors={{color:'#123',darkColor:'#012'}} onCountingComplete={()=>{}} initialScores={{p1:0,p2:0}} audioActive debugContext={{gameId:'g',roundId:'r',userId:'u1',handNumber:1}} persistedTargetIndex={0} persistedBeatIndex={0} persistedHandKey="r:1"/>);
 await tick(300);expect(audio.play).not.toHaveBeenCalled();
});

it('plays a separate zero cue for each hand and the crib, without a positive score or total ding',async()=>{
 const zeroCards=[{rank:'2',suit:'clubs'},{rank:'4',suit:'diamonds'},{rank:'6',suit:'hearts'},{rank:'8',suit:'spades'}];
 const blank={...state,cribOwnerPlayerId:'p2',pegging:{...state.pegging,playedCards:players.flatMap(p=>zeroCards.map(card=>({playerId:p.id,card})))},crib:zeroCards} as CribbageState;
 render(<CribbageCountingPhase countingTime={{...timing,frame:{...timing.frame,state:blank}}} cribbageState={blank} players={players} cardBackColors={{color:'#123',darkColor:'#012'}} onCountingComplete={()=>{}} initialScores={{p1:0,p2:0}} audioActive debugContext={{gameId:'g',roundId:'zero-r',userId:'u1',handNumber:1}}/>);
 await tick(10000);
 expect(audio.play.mock.calls.map(c=>c.slice(0,2))).toEqual([[0,'g:zero-r:1:p1:0:zero'],[0,'g:zero-r:1:p2:1:zero'],[0,'g:zero-r:1:p2:2:zero']]);
});
