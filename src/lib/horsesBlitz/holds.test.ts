import {describe,expect,it} from 'vitest';
import type {BlitzSnapshot} from './model';
import {presentedBlitzHolds,suggestedBlitzHolds} from './holds';

const snapshot=(dice:number[],size:number,rank?:number):BlitzSnapshot=>({handId:'run:1:1',roll:1,dice,held:[],set:{size,rank,points:100,label:'server offer'}} as BlitzSnapshot);
describe('Horses Bank-offer hold suggestions',()=>{
 it.each([
  [[5,6,6,5,5],3,5,[0,3,4]],
  [[5,2,1,3,5],3,5,[0,2,4]],
  [[6,2,1,3,4],2,6,[0,2]],
  [[2,3,4,5,6],1,6,[]],
  [[1,1,1,1,1],5,1,[0,1,2,3,4]],
  [[2,2,6,6,3],2,6,[2,3]],
 ])('selects the offered dice for %j', (dice,size,rank,indices)=>{
  expect(suggestedBlitzHolds(snapshot(dice as number[],size as number,rank as number))).toEqual(indices);
 });
 it('preserves an override, including no holds, through refreshes but resets on the next roll or hand',()=>{
  const v=snapshot([5,2,1,3,5],3,5);
  const selection={handId:v.handId,roll:1,indices:[1,4]};
  expect(presentedBlitzHolds({...v,revision:9,serverAt:9999},selection)).toEqual([1,4]);
  expect(presentedBlitzHolds(v,{...selection,indices:[]})).toEqual([]);
  expect(presentedBlitzHolds({...v,roll:2},selection)).toEqual([0,2,4]);
  expect(presentedBlitzHolds({...v,handId:'run:1:2'},selection)).toEqual([0,2,4]);
  expect(v.set).toEqual({size:3,rank:5,points:100,label:'server offer'});
 });
 it('leaves opening, high-card and malformed offers unheld; supports retained size-only offers',()=>{
  expect(suggestedBlitzHolds({...snapshot([],0),roll:0})).toEqual([]);
  expect(suggestedBlitzHolds(snapshot([5,2,1,3,5],4,5))).toEqual([]);
  expect(suggestedBlitzHolds(snapshot([1,4,4,2,6],3))).toEqual([0,1,2]);
  expect(suggestedBlitzHolds({...snapshot([2,2,3,4,5],2),set:{size:2,points:0,label:'No scoring set'}})).toEqual([]);
 });
});
