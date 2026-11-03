import {describe,it,expect} from 'vitest';
import {INITIAL_COURSES} from './config';
import {createRun,applyIntent,recoverRun,projectRun,type Intent} from './engine';
import {competitionConfig,startPlayerHole,playPlayerHole,completedHole,competitionWinner,megaStandings,MEGA_HOLE_COUNTS} from './competition';
import {resolveExactRunBackConfig} from '../dealerGameSetup/runBackConfig';
import {configurationIssue} from '../delayed/runback';

const decks=(holes:number)=>Array.from({length:holes},()=>Array.from({length:52},(_,i)=>i));
describe('Mega competition uses the Arcade rule engine',()=>{
 it.each(MEGA_HOLE_COUNTS)('live and async runback preserve selected course and %i holes',holes=>{
  const selected=competitionConfig(INITIAL_COURSES[1],holes);
  expect(resolveExactRunBackConfig('mega-card-golf',{ante_amount:7,rules:{...selected,holes}})).toEqual({ante_amount:7,mega:selected});
  expect(configurationIssue({key:'test',game:'mega-card-golf',stake:'7',config:selected},{enabled:true,fake_money_only:false,max_children:32,games:[{id:'mega-card-golf',rules:competitionConfig(INITIAL_COURSES[0],9),courses:INITIAL_COURSES}]})).toBeNull();
 });
 for(const holes of MEGA_HOLE_COUNTS)for(const course of INITIAL_COURSES)it(course.id+' / '+holes+' holes keeps identical actions and scores',()=>{
  const config=competitionConfig(course,holes);
  let arcade=createRun('run','actor',config.course,decks(holes),1000,config.version);
  let competition=startPlayerHole('run','actor',config,null,decks(holes),1000);
  for(let hole=1;hole<=holes;hole++){
   for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'draw'},{type:'replace',index:2},{type:'stand-pat'}] as Intent[]){
    arcade=applyIntent(arcade,structuredClone(intent),arcade.deadline-1000);
    competition=playPlayerHole(competition,structuredClone(intent),competition.deadline-1000);
    expect(competition).toEqual(arcade);
   }
   expect(completedHole(competition)?.hole).toBe(hole);
   expect(projectRun(competition,competition.deadline)).not.toHaveProperty('decks');
   if(hole<holes){const at=arcade.deadline;arcade=recoverRun(arcade,at);competition=startPlayerHole('run','actor',config,competition,null,at);expect(competition).toEqual(arcade);}
  }
  expect(competition.status).toBe('completed');expect(competition.results).toHaveLength(holes);
 });
 it('offline recovery finishes only the current admitted hole',()=>{
  const config=competitionConfig(INITIAL_COURSES[0],18),run=startPlayerHole('id','actor',config,null,decks(18),1000);
  const next=playPlayerHole(run,{type:'tick'},1e12);
  expect(next.hole).toBe(1);expect(next.results).toHaveLength(1);expect(next.status).toBe('active');
  const resumed=startPlayerHole('id','actor',config,next,null,1e12);
  expect(resumed.deadline).toBe(1e12+config.course.completionSeconds*1000);
  expect(()=>startPlayerHole('other','actor',config,next,null,1e12)).toThrow('identity');
  expect(()=>playPlayerHole(next,{type:'stand-pat'},1e12)).toThrow('ended');
 });
 it('lowest signed total wins and ties remain ties',()=>{
  expect(competitionWinner({a:-4,b:2,c:-4})).toEqual(['a','c']);
  expect(competitionWinner({a:0,b:0})).toEqual(['a','b']);
 });
 it('standings use committed holes, count zero scores and reject duplicates',()=>{
  const players=[{id:'a',name:'A'},{id:'b',name:'B'}],result={actor:'a',hole:1,score:0,at:1000};
  expect(megaStandings(players,[result],3)[0]).toMatchObject({thru:1,total:0,scores:[0,null,null]});
  expect(()=>megaStandings(players,[result,result],3)).toThrow('Conflicting');
 });
});
