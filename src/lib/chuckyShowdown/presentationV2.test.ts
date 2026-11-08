import {describe,it,expect} from 'vitest';
import {admit,seek,scoreMotion} from './presentationV2';
import type {V2Snapshot} from './model';
import {winBonus,winCue} from './model';
import type {Card} from '@/lib/cardUtils';
import {scoreCountCue} from '@/lib/run21/scoreCountCue';

const card=(rank:Card['rank']):Card=>({rank,suit:'♠'});
const original:V2Snapshot={
  id:'run',revision:4,status:'active',ruleset:'chucky-showdown/2',serverAt:1000,completion:null,
  round:1,hand:1,roundId:'run:1:1',phase:'showdown',since:1000,due:1900,player:[],community:[],chucky:[],
  folds:3,cracks:3,uses:[2,1,2,2,2,2,2],level:2,risk:1400,beforeRisk:1400,score:0,reason:null,best:null,label:null,tie:null,
  config:{version:'chucky-showdown/2',foldMs:30000,selectMs:30000,maxFolds:3,maxCracks:3},lastShowdown:null,lastRound:null,
};
describe('connected reveal and result continuity',()=>{
 it('holds each accepted fold once before its same-timestamp deal, and never replays on recovery',()=>{
   const old={...original,phase:'fold_stay' as const};
   const fold={...old,phase:'fold' as const,since:2000,due:2000};
   const next={...old,phase:'deal' as const,since:2000,hand:2,roundId:'run:1:2',lastFold:fold};
   const frames=admit(seek(old,1000,true),next,2000);
   expect(frames.map(f=>f.scene.phase)).toEqual(['fold_stay','fold','deal']);
   expect(frames[2].at-frames[1].at).toBe(350);
   expect(admit(frames,next,2050).filter(f=>f.scene.phase==='fold')).toHaveLength(1);
   expect(seek(next,2050)).toMatchObject([{scene:{phase:'deal'},live:false}]);
   const bank={...next,phase:'round_over' as const,hand:1,roundId:old.roundId};
   expect(admit(seek(old,1000,true),bank,2000).map(f=>f.scene.phase)).toEqual(['fold_stay','fold','round_over']);
 });
 it('holds both committed rabbit cards together for three seconds before the final-fold count',()=>{
 const old={...original,phase:'fold_stay' as const,community:[card('A'),card('2')]};
 const fold={...old,phase:'fold' as const,since:2000,due:2000,community:[card('A'),card('2'),card('3'),card('4')]};
 const next={...old,phase:'round_over' as const,since:2000,reason:'folds' as const,lastFold:fold};
 const frames=admit(seek(old,1000,true),next,2000);
 expect(frames.map(f=>f.scene.phase)).toEqual(['fold_stay','fold','round_over']);
 expect(frames[1].scene.community).toHaveLength(4);expect(frames[2].at-frames[1].at).toBe(3000);
 expect(admit(frames,next,2050).filter(f=>f.scene.phase==='fold')).toHaveLength(1);
});
 it('uses the frozen run bonus table and exactly one cue for the confirmed card count',()=>{
   const bonuses=[100,250,500,800,1250,2000,3000];
   const current={...original.config,version:'chucky-showdown/3' as const,winBonuses:bonuses};
   for(let n=1;n<=7;n++){
     expect(winBonus(original.config,n)).toBe(n*100);
     expect(winBonus(current,n)).toBe(bonuses[n-1]);
     expect(winCue(n)).toBe(n===7?'chuckySeven':n===6?'chuckySix':'chuckyWin');
   }
 });
 it('drains missed individual faces and a complete Crack before showing the next hand',()=>{
   const result={...original,phase:'crack' as const,since:3470,due:6620,chucky:[card('K'),card('Q')],cracks:2,best:[card('K')],risk:0};
   const next:V2Snapshot={...original,roundId:'run:1:2',hand:2,phase:'deal',since:6620,due:9120,lastShowdown:result};
   const frames=admit(seek(original,1000,true),next,6800);
   expect(frames.map(f=>[f.scene.phase,f.scene.chucky.length])).toEqual([['showdown',0],['showdown',1],['showdown',2],['crack',2],['deal',0]]);
   expect(frames[2].at-frames[1].at).toBe(720);expect(frames[3].at-frames[2].at).toBe(850);
   expect(frames[4].at-frames[3].at).toBeGreaterThanOrEqual(3000);
   expect(frames[1].scene.best).toBeNull();expect(frames[1].scene.cracks).toBe(3);
   expect(admit(frames,next,6800).length).toBe(frames.length-1);
   expect(seek(next,6850)).toMatchObject([{scene:{phase:'deal'},live:false,at:6620}]);
 });
 it('separates both community flips from decision admission',()=>{
   const initial:V2Snapshot={...original,phase:'fold_stay',community:[card('A'),card('2')]};
   const next:V2Snapshot={...initial,phase:'choose',since:3270,community:[card('A'),card('2'),card('3'),card('4')]};
   const frames=admit(seek(initial,1000,true),next,3520);
   expect(frames.map(f=>[f.scene.phase,f.scene.community.length])).toEqual([['fold_stay',2],['board_reveal',2],['board_reveal',3],['board_reveal',4],['choose',4]]);
   expect(frames[4].at-frames[3].at).toBe(450);
 });
 it('counts only real losses, after the glass cue',()=>{
   expect(scoreMotion({...original,phase:'crack',beforeRisk:0})).toBeNull();
   expect(scoreMotion({...original,phase:'crack'})).toEqual({from:1400,to:0,start:1050,end:2050});
 });
 it('plays bounded falling pitches only for an opted-in decrease',()=>{
   const notes:number[]=[];
   const gain={gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};
   const ctx={currentTime:0,createGain:()=>gain,createOscillator:()=>({frequency:{setValueAtTime:(hz:number)=>notes.push(hz)},start(){},stop(){},connect(){}})} as unknown as AudioContext;
   const render=(down:boolean)=>scoreCountCue(5600,0,0,1000,0,false,down).schedule(ctx,{} as AudioNode,n=>n);
   render(false);expect(notes).toEqual([]);render(true);expect(notes.length).toBeGreaterThan(1);expect(notes.length).toBeLessThanOrEqual(20);
   expect(notes.every((n,i)=>!i||n<notes[i-1])).toBe(true);
 });
});
