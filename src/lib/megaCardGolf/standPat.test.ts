import {it,expect} from 'vitest';
import {applyIntent,createRun,recoverRun,projectRun,canStandPat} from './engine';
import {INITIAL_COURSES,MEGA_STAND_PAT_RULESET,MEGA_RULESET,MEGA_SEQUENTIAL_RULESET} from './config';
import {MegaAuthority,freshStore} from './authority';
import {emptyPresentation,receivePresentation,presentationFrame} from './presentation';
import {golfVisibleSubtotal} from '../golf/scoring';
const deck=()=>Array.from({length:52},(_,i)=>i);
function pending(allowance=0,stock=1,ruleset=MEGA_STAND_PAT_RULESET as typeof MEGA_STAND_PAT_RULESET|typeof MEGA_RULESET|typeof MEGA_SEQUENTIAL_RULESET){
 return applyIntent(createRun('r','u',{...INITIAL_COURSES[0],holes:1,initialExposed:0,discardAllowance:allowance,stockAllowance:stock},[deck()],0,ruleset),{type:'draw'},1);
}
it.each([0,1])('final stock Stand Pat preserves all six cards with %i discards left',allowance=>{
 const before=pending(allowance),next=applyIntent(before,{type:'stand-pat'},2);
 expect(next.cards).toEqual(before.cards);expect(next.discards).toBe(0);expect(next.pending).toBeNull();
 expect(next.exposed).toEqual(Array(6).fill(true));expect(next.results).toHaveLength(1);
 expect(next.results[0]).toMatchObject({reason:'stock',hidden:[0,1,2,3,4,5],score:golfVisibleSubtotal(before.cards)});
 expect(next.status).toBe('completed');expect(next.config).toEqual(before.config);
 expect(recoverRun(next,1e12)).toEqual(next);expect(()=>applyIntent(next,{type:'stand-pat'},3)).toThrow();
});
it('retains replacement and ordinary discard limits; denies non-final, empty and legacy Stand Pat',()=>{
 const before=pending();const replaced=applyIntent(before,{type:'replace',index:4},2);
 expect(replaced.cards[4]).toBe(before.pending);expect(replaced.results[0].hidden).not.toContain(4);
 expect(()=>applyIntent(pending(0,2),{type:'stand-pat'},2)).toThrow('final');
 expect(()=>applyIntent(pending(0,2),{type:'discard'},2)).toThrow('discard');
 expect(canStandPat({...before,pending:null})).toBe(false);
 for(const version of [MEGA_RULESET,MEGA_SEQUENTIAL_RULESET])expect(()=>applyIntent(pending(0,1,version),{type:'stand-pat'},2)).toThrow('final');
});
it('expiry wins at the deadline and never replaces a board card; earlier acceptance scores once',()=>{
 const before=pending();expect(()=>applyIntent(before,{type:'stand-pat'},before.deadline)).toThrow('changed');
 const expired=recoverRun(before,before.deadline);expect(expired.cards).toEqual(before.cards);
 expect(expired.results[0].reason).toBe('timeout');expect(expired.results).toHaveLength(1);
 const accepted=applyIntent(before,{type:'stand-pat'},before.deadline-1);
 expect(recoverRun(accepted,before.deadline+100000).results).toHaveLength(1);
});
it('duplicate/retry and reconnect return the same completed result without replaying presentation',()=>{
 const data=freshStore();data.courses[0]={...data.courses[0],holes:1,initialExposed:0,stockAllowance:1,discardAllowance:0};
 const a=new MegaAuthority(data,()=> 'r',deck,()=>{},MEGA_STAND_PAT_RULESET);
 let v=a.start('u','sunny-meadows','start',0);v=a.action('u',v.id,'draw',v.revision,1,{type:'draw'},1);
 const before=v,next=a.action('u',v.id,'pat',v.revision,1,{type:'stand-pat'},2);
 expect(a.action('u',v.id,'pat',v.revision,1,{type:'stand-pat'},3).revision).toBe(next.revision);
 expect(a.state('u','r',4).cards).toEqual(next.cards);expect(a.data.results).toHaveLength(1);
 let queue=receivePresentation(emptyPresentation(),before,0);queue=receivePresentation(queue,next,1,false,{type:'stand-pat'});
 expect(queue.events.map(e=>e.kind)).toEqual(['scoring','final']);
 expect(presentationFrame(queue,1)?.scoring?.revealing).toBe(true);
 expect(receivePresentation(queue,projectRun(a.data.runs.r,5),2).events).toHaveLength(2);
 expect(receivePresentation(queue,next,2,true).events).toEqual([]);
});
