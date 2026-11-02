// @vitest-environment jsdom
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CribbagePegBoard} from './CribbagePegBoard';
import {CribbageCountingPhase} from './CribbageCountingPhase';
import type {CribbageState} from '@/lib/cribbageTypes';
const audio=vi.hoisted(()=>({play:vi.fn()}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:audio.play}));
vi.mock('@/lib/debugEventLogger',()=>({logDebugEvent:vi.fn()}));
vi.mock('@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider',()=>({useCribbageGameplayGeometry:()=>({placementsById:new Map(),lastValidPlacementsById:new Map()})}));
vi.mock('@/lib/wave4LayoutResolver/useLiveGeometryConstraints',()=>({useLiveGeometryConstraints:()=>({vminInPx:3.9})}));
vi.mock('@/lib/geometryLab/cardArtifactOverlap',()=>({useCardOverlap:()=>0}));
vi.mock('./CribbagePlayingCard',()=>({CribbagePlayingCard:({card}:any)=><span>{card?.rank}{card?.suit}</span>}));
const players=[{id:'p1',user_id:'u1',position:0,profiles:{username:'One'}},{id:'p2',user_id:'u2',position:1,profiles:{username:'Two'}}];
const cards=[{rank:'2',suit:'clubs'},{rank:'2',suit:'hearts'},{rank:'8',suit:'clubs'},{rank:'8',suit:'hearts'}];
const state={phase:'counting',turnOrder:['p1','p2'],dealerPlayerId:'p2',crib:[],cutCard:{rank:'K',suit:'spades'},
 playerStates:{p1:{pegScore:4},p2:{pegScore:0}},pegging:{playedCards:cards.map(card=>({playerId:'p1',card}))}} as unknown as CribbageState;
beforeEach(()=>{vi.useFakeTimers();audio.play.mockReset();vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
const tick=async(ms:number)=>{for(let n=0;n<ms;n+=100)await act(async()=>{vi.advanceTimersByTime(100);});};

it('sounds only when an actual peg left-transition ends, once per new score; mount/resize/recovery are silent',()=>{
 const props={players,winningScore:121,playerStates:state.playerStates,audioScope:'game:round:hand',audioActive:true};
 const ui=render(<CribbagePegBoard {...props}/>);
 const peg=()=>ui.container.querySelector<HTMLDivElement>('[style*="left:"]')!;
 fireEvent.transitionEnd(peg(),{propertyName:'left'});expect(audio.play).not.toHaveBeenCalled();
 ui.rerender(<CribbagePegBoard {...props} overrideScores={{p1:6,p2:0}}/>);expect(audio.play).not.toHaveBeenCalled();
 fireEvent.transitionEnd(peg(),{propertyName:'width'});expect(audio.play).not.toHaveBeenCalled();
 fireEvent.transitionEnd(peg(),{propertyName:'left'});fireEvent.transitionEnd(peg(),{propertyName:'left'});
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.play.mock.calls[0].slice(0,2)).toEqual(['peg','game:round:hand:p1:6']);
 ui.rerender(<CribbagePegBoard {...props} audioScope="other-hand" overrideScores={{p1:10,p2:0}}/>);
 fireEvent.transitionEnd(peg(),{propertyName:'left'});expect(audio.play).toHaveBeenCalledTimes(1);
});
it('plays one cue per raised scoring pair; persistent highlights and score totals do not produce more cues',async()=>{
 const props={cribbageState:state,players,cardBackColors:{color:'#123',darkColor:'#012'},onCountingComplete:vi.fn(),initialScores:{p1:0,p2:0},audioActive:true,debugContext:{gameId:'g',roundId:'r',userId:'u1',handNumber:1}};
 audio.play.mockImplementation(()=>expect(document.querySelectorAll('[data-card-highlighted="true"]').length).toBeGreaterThanOrEqual(2));
 const ui=render(<CribbageCountingPhase {...props}/>);expect(audio.play).not.toHaveBeenCalled();
 await tick(1500);expect(audio.play).toHaveBeenCalledTimes(1);
 for(let i=0;i<5;i++)ui.rerender(<CribbageCountingPhase {...props}/>);
 expect(audio.play).toHaveBeenCalledTimes(1);
 await tick(2600);expect(audio.play).toHaveBeenCalledTimes(2);
 expect(audio.play.mock.calls.map(c=>c[1])).toEqual(['g:r:1:p1:0:0','g:r:1:p1:0:1']);
});
it('does not sound an already-highlighted persisted combo on reconnect',async()=>{
 render(<CribbageCountingPhase cribbageState={state} players={players} cardBackColors={{color:'#123',darkColor:'#012'}} onCountingComplete={()=>{}} initialScores={{p1:0,p2:0}} audioActive debugContext={{gameId:'g',roundId:'r',userId:'u1',handNumber:1}} persistedTargetIndex={0} persistedBeatIndex={0} persistedHandKey="r:1"/>);
 await tick(300);expect(audio.play).not.toHaveBeenCalled();
});
