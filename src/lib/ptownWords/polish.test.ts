import {describe,it,expect} from 'vitest';
import {nextDraftSquare} from './draftDirection';
import {scoreFrame} from './scorePresentation';
import {pendingNoticeKeys,turnDestination} from '../delayed/notifications';
import type {WordsSnapshot} from './model';
describe('Words polish authority-independent projections',()=>{
 const board=Array(225).fill(null),p=(square:number)=>({square,tileId:square,letter:'A'});
 it('requires two aligned connected tiles and resets at zero or one',()=>{
  for(const draft of [[],[p(112)],[p(112),p(128)],[p(112),p(114)]])expect(nextDraftSquare(draft,board)).toBeNull();
  expect(nextDraftSquare([p(112),p(113)],board)).toBe(114);
  expect(nextDraftSquare([p(112),p(127)],board)).toBe(142);
 });
 it('skips committed cells without wrapping at the board edge',()=>{
  const b=[...board];b[113]={id:1};b[115]={id:2};expect(nextDraftSquare([p(112),p(114)],b)).toBe(116);
  expect(nextDraftSquare([p(13),p(14)],b)).toBeNull();expect(nextDraftSquare([p(209),p(224)],b)).toBeNull();
 });
 it('counts from the previous displayed score into the exact authoritative target without mutation',()=>{
  const v={identity:{dealerGameId:'d'},viewerId:'me',turn:2,scores:{me:20},moves:[{turn:1,playerId:'me',action:'place',points:8}],movePresentation:{turn:1,playerId:'me'}} as unknown as WordsSnapshot;
  expect(scoreFrame(v,1000,1000)?.score).toBe(12);expect(scoreFrame(v,2000,1000)?.score).toBe(12);
  expect(scoreFrame(v,2300,1000)?.score).toBe(16);expect(scoreFrame(v,2600,1000)?.score).toBe(20);
  expect(scoreFrame(v,4599,1000)?.active).toBe(true);expect(scoreFrame(v,4600,1000)?.active).toBe(false);expect(v.scores.me).toBe(20);
 });
 it('notification identities do not change just because an outstanding turn was read',()=>{
  const n={id:'a',revision:4,read_revision:0,actionable:true};expect(pendingNoticeKeys([n])).toEqual(pendingNoticeKeys([{...n,read_revision:4}]));
  expect(pendingNoticeKeys([{...n,actionable:false,read_revision:4}])).toEqual([]);
 });
 it('direct navigation requires exactly one fresh authoritative own turn',()=>{
  const h={id:'m',status:'active',held:false,serverAt:1000,lineup:[{id:'c',terminal:false,actor:'me',expiresAt:new Date(2000).toISOString()}]} as any;
  expect(turnDestination(h,'me')).toBe('/delayed/m/play/c');
  for(const value of [{...h,held:true},{...h,status:'settled'},{...h,serverAt:3000},{...h,lineup:[...h.lineup,...h.lineup]}])expect(turnDestination(value,'me')).toBe('/delayed/m');
  expect(turnDestination(h,'other')).toBe('/delayed/m');
 });
});
