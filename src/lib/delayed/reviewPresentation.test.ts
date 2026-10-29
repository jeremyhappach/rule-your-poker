import {describe,expect,it} from 'vitest';
import {reviewSchedule,rebaseReviewBoard,reviewScoreContext} from './reviewPresentation';
import {RUN21_RULES,medalDuration} from '@/lib/run21/rulesets';
import {SCORE_PRESENTATION_MS} from '@/lib/run21/model';
import type {ReviewEvent} from './reviews';
const event=(game:string,board:any):ReviewEvent=>({id:'e',kind:'attempt',actor:'opponent',round:1,score:100,at:'',seen:false,receipt:{game,rules:RUN21_RULES},board});
describe('frozen shared result schedules',()=>{
 it.each([104,105] as const)('Run21 %s finishes its medal before the shared count',aggregate=>{const schedule=reviewSchedule(event('run21',{result:{score:100,aggregate}}));expect(schedule.medal).toBe(medalDuration(RUN21_RULES,aggregate));expect(schedule.duration).toBe(schedule.medal+SCORE_PRESENTATION_MS);expect(schedule.countStart).toBe(schedule.medal);});
 it.each([['tri-towers',{version:'tri-towers/5',holdMs:5000,clearCelebrationMs:3000},'cleared',8000,4200,7000],['tri-towers',{version:'tri-towers/2',holdMs:3100},'take_score',3100,0,2800],['quintzee',{resultMs:5000},'all_categories',5000,1200,4000],['boxdrop',{holdMs:8000},'full_clear',8000,4200,7000]])('%s retains its result window',(game,rules,reason,duration,start,end)=>{expect(reviewSchedule(event(game as string,{rules,result:{reason}}))).toMatchObject({duration,countStart:start,countEnd:end});});
 it('rebases Words reveal/count timestamps without changing its saved board or authority',()=>{const value=event('ptown-words',{deadline:99,movePresentation:{startedAt:100,announceAt:900,readyAt:4500},scores:{opponent:100}}),before=structuredClone(value);const board=rebaseReviewBoard(value,10000);expect(board.movePresentation).toEqual({startedAt:10000,announceAt:10800,readyAt:14400});expect(reviewSchedule(value)).toMatchObject({duration:4400,countStart:1800,countEnd:2400});expect(value).toEqual(before);});
});
describe('viewer-safe cumulative replay context',()=>{
 const home={players:[{id:'me',name:'Me'},{id:'opponent',name:'Opponent'}],lineup:[{id:'child',scores:{me:80000,opponent:999999}}]} as any;
 const current={...event('quintzee',{score:999999,result:{scoreBefore:979954,score:999999,stageScore:20045}}),round:2,score:20045};
 const prior={...current,id:'prior',round:1,score:19803,seen:true};
 it('counts the round award onto acknowledged prior contributions, never the saved cumulative total',()=>{
  const context=reviewScoreContext(current,[prior,current],home,'child','me');
  expect(context).toMatchObject({before:19803,after:39848,players:[{id:'me',score:80000},{id:'opponent',score:39848}]});
  const board=rebaseReviewBoard(current,1000,context.before);
  expect(board.result).toMatchObject({scoreBefore:19803,score:39848,stageScore:20045});expect(current.board.score).toBe(999999);
 });
 it('excludes unseen earlier and future contributions and deduplicates delivered events',()=>{
  const values=[prior,prior,current,{...prior,id:'hidden',round:0,score:70000,seen:false},{...prior,id:'future',round:3,score:60000}];
  expect(reviewScoreContext(current,values,home,'child','me').after).toBe(39848);
 });
 it('replaying an acknowledged round does not add it twice',()=>{
  const seen={...current,seen:true};expect(reviewScoreContext(seen,[prior,seen],home,'child','me').after).toBe(39848);
 });
 it('first reveal starts at zero without disclosing another pending round',()=>{
  expect(reviewScoreContext({...current,round:1},[{...prior,seen:false}],home,'child','me').before).toBe(0);
 });
 it('Run21 preserves the round score used by its medal while presenting a separate cumulative range',()=>{
  const run={...current,receipt:{game:'run21',rules:RUN21_RULES},board:{result:{score:20045,aggregate:100}}};
  expect(rebaseReviewBoard(run,1000,19803).result.score).toBe(20045);
 });
});
