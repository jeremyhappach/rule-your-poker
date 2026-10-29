import {describe,expect,it} from 'vitest';
import {reviewSchedule,rebaseReviewBoard} from './reviewPresentation';
import {RUN21_RULES,medalDuration} from '@/lib/run21/rulesets';
import {SCORE_PRESENTATION_MS} from '@/lib/run21/model';
import type {ReviewEvent} from './reviews';
const event=(game:string,board:any):ReviewEvent=>({id:'e',kind:'attempt',actor:'opponent',round:1,score:100,at:'',seen:false,receipt:{game,rules:RUN21_RULES},board});
describe('frozen shared result schedules',()=>{
 it.each([104,105] as const)('Run21 %s finishes its medal before the shared count',aggregate=>{const schedule=reviewSchedule(event('run21',{result:{score:100,aggregate}}));expect(schedule.medal).toBe(medalDuration(RUN21_RULES,aggregate));expect(schedule.duration).toBe(schedule.medal+SCORE_PRESENTATION_MS);expect(schedule.countStart).toBe(schedule.medal);});
 it.each([['tri-towers',{version:'tri-towers/5',holdMs:5000,clearCelebrationMs:3000},'cleared',8000,4200,7000],['tri-towers',{version:'tri-towers/2',holdMs:3100},'take_score',3100,0,2800],['quintzee',{resultMs:5000},'all_categories',5000,1200,4000],['boxdrop',{holdMs:8000},'full_clear',8000,4200,7000]])('%s retains its result window',(game,rules,reason,duration,start,end)=>{expect(reviewSchedule(event(game as string,{rules,result:{reason}}))).toMatchObject({duration,countStart:start,countEnd:end});});
 it('rebases Words reveal/count timestamps without changing its saved board or authority',()=>{const value=event('ptown-words',{deadline:99,movePresentation:{startedAt:100,announceAt:900,readyAt:4500},scores:{opponent:100}}),before=structuredClone(value);const board=rebaseReviewBoard(value,10000);expect(board.movePresentation).toEqual({startedAt:10000,announceAt:10800,readyAt:14400});expect(reviewSchedule(value)).toMatchObject({duration:4400,countStart:1800,countEnd:2400});expect(value).toEqual(before);});
});
