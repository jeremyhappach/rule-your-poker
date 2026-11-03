import {it,expect} from 'vitest';
import {createRun,applyIntent,projectRun} from './engine';
import {INITIAL_COURSES} from './config';
import {competitionConfig} from './competition';
import {emptyPresentation,receiveCompetitionPresentation,presentationFrame} from './presentation';
it('retains an admitted scoring sequence across the next participant without crossing action identity',()=>{
 const cfg=competitionConfig(INITIAL_COURSES[0],3),decks=Array.from({length:3},()=>Array.from({length:52},(_,i)=>i));
 let first=createRun('match:first','first',cfg.course,decks,0,cfg.version);
 first=applyIntent(first,{type:'open',indices:[0]},1);first=applyIntent(first,{type:'open',indices:[1]},2);first=applyIntent(first,{type:'stand-pat'},3);
 const old=receiveCompetitionPresentation(emptyPresentation(),projectRun(first,3),0),end=old.events[0].end;
 const next=createRun('match:second','second',cfg.course,decks,5,cfg.version);
 const queue=receiveCompetitionPresentation(old,projectRun(next,5),10);
 expect(presentationFrame(queue,20)!.view.id).toBe('match:first');expect(presentationFrame(queue,20)!.locked).toBe(true);
 expect(presentationFrame(queue,end+1)!.view.id).toBe('match:second');
 expect(presentationFrame(queue,queue.events.at(-1)!.end+1)!.locked).toBe(false);
});
