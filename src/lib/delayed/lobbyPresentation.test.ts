// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {lobbyGameGroup,matchGameMix,matchLobbyStatus} from './lobbyPresentation';
import type {ChildSummary,Home} from './client';
const now=1800000000000;
const child=(game:ChildSummary['game'],patch:Partial<ChildSummary>={}):ChildSummary=>({
 id:game,ordinal:1,game,stake:5,config:{},starter:'a',actor:'b',segment:1,revision:1,terminal:false,
 availableAt:null,lastCallAt:null,expiresAt:new Date(now+3600000).toISOString(),startedAt:null,
 playable:false,playableDeadline:new Date(now+180000).toISOString(),result:null,...patch,
});
const home=(lineup:ChildSummary[],patch:Partial<Home>={}):Home=>({
 id:'match',status:'active',revision:1,realMoney:false,offerHash:'',organizer:'a',opponent:'b',
 players:[{id:'a',name:'Same'},{id:'b',name:'Same'}],createdAt:'',invitationExpiresAt:'',acceptedAt:'',
 settledAt:null,held:false,lineup,net:0,completed:0,exposure:5,receipt:null,serverAt:now,...patch,
});
describe('viewer-specific playability versus turn ownership',()=>{
 it('keeps invitations, playable turns and intermediate opponent reviews independently actionable',()=>{
  expect(matchLobbyStatus(home([],{status:'invited'}),'b',now).actionable).toBe(true);
  const review=child('run21',{pendingResults:{b:2},playable:false});
  expect(matchLobbyStatus(home([review]),'a',now)).toMatchObject({own:0,results:1,actionable:true});
  expect(matchLobbyStatus(home([{...review,pendingResults:{a:2}}]),'a',now)).toMatchObject({results:0,actionable:false});
  const own=child('boxdrop',{actor:'a',playable:true});
  expect(matchLobbyStatus(home([review,own]),'a',now)).toMatchObject({own:1,results:1,actionable:true});
  expect(matchLobbyStatus(home([{...review,pendingResults:{}},own]),'a',now).actionable).toBe(true);
  expect(matchLobbyStatus(home([{...review,pendingResults:{}},{...own,actor:'b',playable:false}]),'a',now).actionable).toBe(false);
 });
 it.each(['chess','ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown'] as const)('counts the opponent-owned %s turn despite playable=false',game=>{
  expect(matchLobbyStatus(home([child(game)]),'a',now)).toMatchObject({own:0,other:1,actionable:false,nextDeadline:now+180000});
  expect(matchLobbyStatus(home([child(game,{playable:true})]),'b',now)).toMatchObject({own:1,other:0,actionable:true});
 });
 it('excludes completed, expired, unassigned and unrelated actors and respects own admission',()=>{
  const items=[child('chess'),child('run21',{terminal:true}),child('boxdrop',{playableDeadline:new Date(now).toISOString()}),
   child('quintzee',{actor:null}),child('take-two',{actor:'outsider'}),child('tri-towers',{actor:'a',playable:false})];
  expect(matchLobbyStatus(home(items),'a',now)).toMatchObject({own:0,other:1});
  expect(matchLobbyStatus(home([child('run21',{playable:undefined,playableDeadline:undefined})]),'a',now).other).toBe(1);
 });
 it.each([{status:'invited'},{status:'settled'},{status:'declined'},{held:true},{removedAt:'removed'}])('excludes inactive matches %j',patch=>{
  expect(matchLobbyStatus(home([child('chess')],patch),'a',now)).toMatchObject({own:0,other:0});
 });
});
describe('Five Alive simultaneous obligations with current lobby guards',()=>{
 it.each([null,'a','b'] as const)('counts both players independently of actor %s in a mixed lineup',actor=>{
  const five=child('five-alive',{actor,playable:true,opponentPlayable:true});
  const match=home([five,child('chess'),child('run21',{actor:'a',playable:true})]);
  expect(matchLobbyStatus(match,'a',now)).toMatchObject({own:2,other:2,actionable:true});
  expect(lobbyGameGroup(five,match,'a',now)).toBe(0);
  five.playable=false;
  expect(matchLobbyStatus(match,'a',now)).toMatchObject({own:1,other:2});
  expect(lobbyGameGroup(five,match,'a',now)).toBe(2);
  five.opponentPlayable=false;
  expect(matchLobbyStatus(home([five]),'a',now)).toMatchObject({own:0,other:0,actionable:false,nextDeadline:Infinity});
 });
 it.each([{status:'invited'},{status:'settled'},{status:'declined'},{held:true},{removedAt:'removed'}])('does not revive either player in an inactive match %j',patch=>{
  const five=child('five-alive',{playable:true,opponentPlayable:true}),match=home([five,child('chess')],patch);
  expect(matchLobbyStatus(match,'a',now)).toMatchObject({own:0,other:0,nextDeadline:Infinity});
  expect(lobbyGameGroup(five,match,'a',now)).toBe(2);
 });
 it.each([{terminal:true},{playableDeadline:new Date(now).toISOString()}])('excludes completed or expired simultaneous obligations %j',patch=>{
  expect(matchLobbyStatus(home([child('five-alive',{playable:true,opponentPlayable:true,...patch}),child('chess')]),'a',now)).toMatchObject({own:0,other:1});
 });
});
it('summarizes the complete current lineup in ordinal order, including completed games',()=>{
 const lineup=[child('ptown-words',{ordinal:5}),child('run21',{ordinal:2,terminal:true}),child('tri-towers',{ordinal:3}),child('run21',{ordinal:1}),child('tri-towers',{ordinal:4})];
 const original=lineup.map(c=>c.ordinal);
 expect(matchGameMix(lineup)).toBe('2x Run21, 2x Tri-Towers, P-Town Words');
 expect(lineup.map(c=>c.ordinal)).toEqual(original);
 expect(matchGameMix([...lineup,child('chess',{ordinal:6})])).toContain(', P-Town Chess');
 expect(matchGameMix(lineup.filter(c=>c.game!=='tri-towers'))).toBe('2x Run21, P-Town Words');
 expect(matchGameMix([])).toBe('');
});
