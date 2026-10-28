import {it,expect} from 'vitest';
import {createRun,applyIntent,projectRun,recoverRun} from './engine';
import {INITIAL_COURSES,MEGA_SEQUENTIAL_RULESET} from './config';
import {MegaAuthority,freshStore} from './authority';
const deck=()=>Array.from({length:52},(_,i)=>i);
const make=(count=2)=>createRun('r','u',{...INITIAL_COURSES[0],initialExposed:count},Array.from({length:9},deck),1000,MEGA_SEQUENTIAL_RULESET);
it('v2 commits one choice and projects only its face before accepting the second',()=>{
 const run=make(),first=applyIntent(run,{type:'open',indices:[1]},1100);
 expect(first.phase).toBe('opening');expect(first.revision).toBe(1);expect(first.deadline).toBe(run.deadline);
 expect(projectRun(first,1100).cards).toEqual([null,1,null,null,null,null]);
 const restored=JSON.parse(JSON.stringify(first)),second=applyIntent(restored,{type:'open',indices:[4]},1200);
 expect(second.phase).toBe('playing');expect(second.exposed.filter(Boolean)).toHaveLength(2);
 expect(second.draws).toBe(0);expect(second.pending).toBeNull();expect(second.config).toEqual(run.config);
});
it('rejects paired, duplicate, invalid, premature draw and third opening input',()=>{
 const run=make();for(const indices of [[],[0,1],[-1],[6],[1.5]])expect(()=>applyIntent(run,{type:'open',indices},1100)).toThrow();
 const first=applyIntent(run,{type:'open',indices:[1]},1100);
 expect(()=>applyIntent(first,{type:'open',indices:[1]},1200)).toThrow();expect(()=>applyIntent(first,{type:'draw'},1200)).toThrow();
 const second=applyIntent(first,{type:'open',indices:[4]},1200);
 expect(()=>applyIntent(second,{type:'open',indices:[5]},1300)).toThrow();
});
it('honors every frozen configured opening count including zero and five',()=>{
 for(let count=0;count<=5;count++){
  let run=make(count);for(let i=0;i<count;i++){expect(run.phase).toBe('opening');run=applyIntent(run,{type:'open',indices:[i]},1100+i);}
  expect(run.phase).toBe('playing');expect(run.exposed.filter(Boolean)).toHaveLength(count);
 }
});
it('retains v1 pair behavior and keeps v2 across holes without rewriting completed results',()=>{
 const old=createRun('old','u',INITIAL_COURSES[0],Array.from({length:9},deck),1000);
 expect(()=>applyIntent(old,{type:'open',indices:[0]},1100)).toThrow();expect(applyIntent(old,{type:'open',indices:[0,5]},1100).phase).toBe('playing');
 const first=applyIntent(make(),{type:'open',indices:[1]},1100),closed=recoverRun(first,first.deadline),next=recoverRun(closed,closed.deadline);
 expect(next.ruleset).toBe(MEGA_SEQUENTIAL_RULESET);expect(next.results).toEqual(closed.results);expect(next.config).toEqual(first.config);
 expect(next.exposed.every(x=>!x)).toBe(true);expect(next.phase).toBe('opening');
 expect(()=>applyIntent(first,{type:'open',indices:[2]},first.deadline)).toThrow('hole changed');
});
it('receipts replay first selection without spending another choice, and stale races cannot overwrite it',()=>{
 const authority=new MegaAuthority(freshStore(),()=> 'r',deck,()=>{},MEGA_SEQUENTIAL_RULESET);
 const run=authority.start('u','sunny-meadows','start',1000),intent={type:'open' as const,indices:[1]};
 const first=authority.action('u','r','first',run.revision,1,intent,1100);
 expect(authority.action('u','r','first',run.revision,1,intent,1200).exposed).toEqual(first.exposed);
 expect(()=>authority.action('u','r','race',run.revision,1,{type:'open',indices:[4]},1200)).toThrow('Stale');
 expect(()=>authority.action('u','r','first',first.revision,1,{type:'open',indices:[4]},1200)).toThrow('identity');
 expect(()=>authority.state('other','r',1200)).toThrow();
 authority.action('u','r','second',first.revision,1,{type:'open',indices:[4]},1300);
 expect(authority.action('u','r','first',run.revision,1,intent,1400).exposed.filter(Boolean)).toHaveLength(2);
});
