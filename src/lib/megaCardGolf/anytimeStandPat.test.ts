import {it,expect} from 'vitest';
import {applyIntent,createRun,recoverRun,canStandPat,projectRun} from './engine';
import {INITIAL_COURSES,MEGA_ANYTIME_STAND_PAT_RULESET as V4,MEGA_STAND_PAT_RULESET as V3} from './config';
import {MegaAuthority,freshStore} from './authority';
import {golfVisibleSubtotal} from '../golf/scoring';
import {emptyPresentation,receivePresentation,presentationFrame} from './presentation';
const deck=()=>Array.from({length:52},(_,i)=>i);
function fixture(){return createRun('r','u',{...INITIAL_COURSES[0],holes:2,initialExposed:0},[deck(),deck()],0,V4);}
it('finishes without changing the tableau across stock, discard, pending and visibility combinations',()=>{
 for(const pending of [null,30])for(const draws of [0,5,16])for(const discards of [0,5])for(const exposedCount of [0,2,5,6]){
  const before={...fixture(),pending,draws,discards,exposed:Array.from({length:6},(_,i)=>i<exposedCount)};
  expect(canStandPat(before)).toBe(true);const next=applyIntent(before,{type:'stand-pat'},1);
  expect(next.cards).toEqual(before.cards);expect(next.draws).toBe(draws);expect(next.discards).toBe(discards);
  expect(next.phase).toBe('scoring');expect(next.pending).toBeNull();expect(next.results).toHaveLength(1);
  expect(next.results[0]).toMatchObject({reason:'stand-pat',score:golfVisibleSubtotal(before.cards),hidden:before.exposed.flatMap((x,i)=>x?[]:[i])});
  expect(next.config).toEqual(before.config);expect(next.exposed.every(Boolean)).toBe(true);
  expect(()=>applyIntent(next,{type:'stand-pat'},2)).toThrow();
  const continued=recoverRun(next,next.deadline);expect(continued.hole).toBe(2);expect(continued.results).toHaveLength(1);
 }
});
it('preserves opening selection, old /3 final-only rules and authoritative expiry',()=>{
 const opening=createRun('r','u',INITIAL_COURSES[0],Array.from({length:9},deck),0,V4);
 expect(canStandPat(opening)).toBe(false);expect(()=>applyIntent(opening,{type:'stand-pat'},1)).toThrow('opening');
 expect(canStandPat({...fixture(),ruleset:V3,pending:30,draws:5})).toBe(false);
 expect(canStandPat({...fixture(),ruleset:V3,pending:30,draws:16})).toBe(true);
 const before={...fixture(),pending:30};expect(()=>applyIntent(before,{type:'stand-pat'},before.deadline)).toThrow('changed');
 const expired=recoverRun(before,before.deadline);expect(expired.results[0].reason).toBe('timeout');expect(expired.cards).toEqual(before.cards);
 expect(applyIntent(before,{type:'stand-pat'},before.deadline-1).results[0].reason).toBe('stand-pat');
});
it('replay/reconnect preserve one completion, reject conflicts, and reuse reveal/result presentation',()=>{
 const store=freshStore();store.courses[0]={...store.courses[0],holes:1,initialExposed:0};
 const a=new MegaAuthority(store,()=> 'r',deck,()=>{},V4),before=a.start('u',store.courses[0].id,'start',0);
 const next=a.action('u','r','pat',before.revision,1,{type:'stand-pat'},1);
 expect(a.action('u','r','pat',before.revision,1,{type:'stand-pat'},2).revision).toBe(next.revision);
 expect(()=>a.action('u','r','pat',before.revision,1,{type:'draw'},2)).toThrow('reused');
 expect(()=>a.action('u','r','other',before.revision,1,{type:'draw'},2)).toThrow('Stale');
 expect(a.state('u','r',2).cards).toEqual(next.cards);expect(a.data.results).toHaveLength(1);
 const queue=receivePresentation(receivePresentation(emptyPresentation(),before,0),next,1,false,{type:'stand-pat'});
 expect(queue.events.map(e=>e.kind)).toEqual(['scoring','final']);expect(presentationFrame(queue,1)?.scoring?.revealing).toBe(true);
 expect(receivePresentation(queue,projectRun(a.data.runs.r,2),2,true).events).toEqual([]);
});
