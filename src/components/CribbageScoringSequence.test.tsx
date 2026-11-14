// @vitest-environment jsdom
import {useCallback,useRef,useState} from 'react';
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CribbageCountingPhase} from './CribbageCountingPhase';
import {CanonicalAnnouncementProvider,useAnnouncements} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import {CanonicalAnnouncementLayer} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementLayer';
import {cribbageScoringScope,publishCribbageScoringNotice} from '@/lib/cribbage/scoringPresentation';
import {createCountingClock} from '@/lib/cribbage/countingClock';
import type {CribbageState} from '@/lib/cribbageTypes';
const audio=vi.hoisted(()=>({play:vi.fn()}));
vi.mock('@/lib/cribbage/sounds',async original=>({...await original<object>(),presentCribbageScore:audio.play}));
vi.mock('@/lib/debugEventLogger',()=>({logDebugEvent:()=>{}}));
vi.mock('@/lib/geometryLab/cardArtifactOverlap',()=>({useCardOverlap:()=>0}));
const players=[{id:'a',user_id:'u1',position:0},{id:'b',user_id:'u2',position:1}];
const crib=[{rank:'7',suit:'clubs',value:7},{rank:'7',suit:'hearts',value:7},{rank:'7',suit:'diamonds',value:7},{rank:'K',suit:'spades',value:10}];
const state={phase:'counting',turnOrder:['a','b'],dealerPlayerId:'b',cribOwnerPlayerId:'b',crib,
 cutCard:{rank:'A',suit:'spades',value:1},pegging:{playedCards:players.flatMap(p=>[{rank:'3',suit:'clubs',value:3},{rank:'6',suit:'diamonds',value:6},{rank:'10',suit:'hearts',value:10},{rank:'K',suit:'spades',value:10}].map(card=>({playerId:p.id,card})))},playerStates:{a:{pegScore:0},b:{pegScore:12}}} as unknown as CribbageState;
beforeEach(()=>{vi.useFakeTimers();audio.play.mockReset();vi.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
const tick=async(ms:number)=>{for(let n=0;n<ms;n+=50)await act(async()=>{vi.advanceTimersByTime(50);});};
it('keeps every callout with its raised cards and completes the final trip sevens before handoff',async()=>{
 const clock=createCountingClock(vi.fn());
 const frame={gameId:'g',dealerGameId:'dg',roundId:'old',handNumber:1,pauseVersion:0,paused:false,state};
 clock.accept(clock.request(),performance.now(),new Date().toISOString(),frame);
 const time=clock.getSnapshot()!;
 const before=vi.fn(),after=vi.fn(),observed:Array<{points:number;text:string;highlights:number;at:number}>=[];
 audio.play.mockImplementation((points:number)=>observed.push({points,text:document.querySelector('[data-canonical-announcement-content]')?.textContent??'',
   highlights:document.querySelectorAll('[data-card-highlighted="true"]').length,at:performance.now()}));
 function Scene({complete}:{complete:()=>void}){
   const rail=useAnnouncements(),latest=useRef(rail);latest.current=rail;
   const [scores,setScores]=useState<Record<string,number>>({a:0,b:0});
   const announce=useCallback((text:string|null,label:string|null,key?:number,target?:number,category?:string,onRetired?:(reason:string)=>void)=>{
     if(!text){latest.current.retireTransientScope(cribbageScoringScope('g','old'));return;}
     publishCribbageScoringNotice(latest.current,{gameId:'g',roundId:'old',id:[target,key,text].join(':'),title:label+': '+text,
       ttlMs:category==='total'?2500:0,onRetired});
   },[]);
   return <><CanonicalAnnouncementLayer/><output>{scores.b}</output><CribbageCountingPhase cribbageState={state} players={players}
     countingTime={time} onCountingComplete={complete} onScoreUpdate={setScores} onAnnouncementChange={announce}
     initialScores={{a:0,b:0}} persistedTargetIndex={2} persistedBeatIndex={-1} persistedHandKey="old"
     cardBackColors={{color:'blue',darkColor:'navy'}} audioActive debugContext={{gameId:'g',roundId:'old',handNumber:1,userId:'u1'}}/></>;
 }
 const ui=render(<CanonicalAnnouncementProvider dealerGameId="g"><Scene complete={before}/></CanonicalAnnouncementProvider>);
 await tick(6000);
 expect(observed.map(e=>e.points)).toEqual([2,2,2]);
 act(()=>clock.accept(clock.request(),performance.now(),new Date().toISOString(),{...frame,roundId:'next',handNumber:2}));
 ui.rerender(<CanonicalAnnouncementProvider dealerGameId="g"><Scene complete={after}/></CanonicalAnnouncementProvider>);
 await tick(2000);
 expect(observed.map(e=>e.points)).toEqual([2,2,2,6]);
 for(const event of observed){expect(event.text).toContain('+'+event.points);expect(event.highlights).toBeGreaterThanOrEqual(2);}
 expect(document.querySelector('output')?.textContent).toBe('12');
 expect(after).not.toHaveBeenCalled();
 await tick(600);
 expect(document.querySelectorAll('[data-card-highlighted="true"]').length).toBe(3);
 await tick(7000);
 expect(before).not.toHaveBeenCalled();expect(after).toHaveBeenCalledOnce();
});
