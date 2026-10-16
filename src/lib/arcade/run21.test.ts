import {describe,it,expect} from 'vitest';
import {createSoloRun,advanceSolo,applySolo,soloProjection,nextDue} from './run21';
import {DEFAULT_CONFIG} from '../run21/model';
import {fixtureDeck,fixtureMatch,act,PLAYERS,uuid} from '../run21/fixtures';
import {canCollect,legalColumns} from '../run21/rules';
import type {RunRecord} from './model';
const config={...DEFAULT_CONFIG,firstPlacementSeconds:30,roundIntroMs:2500,roundDurationMs:250000,scorePresentationMs:5000,silverCelebrationMs:2800,goldCelebrationMs:3800};
const row:RunRecord={id:uuid(22),user_id:PLAYERS[0].id,game:'run21',ruleset:'run21/arcade-1',config,revision:0,state:null,status:'active',created_at:new Date(0).toISOString(),server_at:0};
describe('Solo Run21 authority',()=>{
 it('matches multiplayer board outcomes across 50 deterministic decks and commands',()=>{
  for(let seed=1;seed<=50;seed++){
   const deck=fixtureDeck([],seed).cards;
   let solo=createSoloRun(row,0,()=>deck),match=fixtureMatch(config,[],seed);
   match=act(match,PLAYERS[0].id,{type:'ready'},0);
   let time=2500;
   for(let n=0;n<53&&!solo.board.result;n++){
    const columns=legalColumns(solo.board,config);
    const intent=canCollect(solo.board,config)?{type:'collect' as const}:n===1?{type:'pass' as const}:{type:'place' as const,column:columns[(seed+n)%columns.length]};
    solo=applySolo(solo,intent,time);match=act(match,PLAYERS[0].id,intent,time);time+=371;
   }
   expect(solo.board.result).toEqual(match.rounds[0].boards[PLAYERS[0].id].result);
   expect(solo.board.columns).toEqual(match.rounds[0].boards[PLAYERS[0].id].columns);
   expect(solo.score).toBe(match.cumulative[PLAYERS[0].id]);
  }
 });
 it('first-placement expiry terminates unranked without remaining rounds',()=>{
  const state=advanceSolo(createSoloRun(row,0),9000000);
  expect(state.status).toBe('expired');expect(state.round).toBe(1);expect(state.results).toHaveLength(0);expect(nextDue(state)).toBeNull();
 });
 it('keeps automatic progression and clocks when nobody is connected',()=>{
  let state=applySolo(createSoloRun(row,0),{type:'place',column:0},2500);
  state=advanceSolo(state,252500);expect(state.board.result?.reason).toBe('timeout');expect(state.score).toBe(0);
  state=advanceSolo(state,257500);expect(state.round).toBe(2);expect(state.board.firstPlacementDeadline).toBe(290000);
  state=advanceSolo(state,1000000);expect(state.status).toBe('expired');expect(state.round).toBe(2);
 });
 it('ends after exactly three rounds, with no tie extension',()=>{
  let state=createSoloRun(row,0);
  for(let n=0;n<3;n++){
   state=applySolo(state,{type:'place',column:0},state.board.firstPlacementDeadline!-30000);
   state=advanceSolo(state,state.board.deadline!);
   if(n<2)state=advanceSolo(state,state.presentation!.endsAt);
  }
  expect(state.status).toBe('completed');expect(state.results).toHaveLength(3);expect(state.score).toBe(0);
  expect(advanceSolo(state,9999999)).toEqual(state);
 });
 it('preserves the perfect-board medal followed by the complete score presentation',()=>{
  const state=createSoloRun(row,0);
  state.board.columns=Array.from({length:5},()=>[{rank:'K',suit:'hearts'},{rank:'Q',suit:'spades'},{rank:'A',suit:'clubs'}]);
  state.board.startedAt=2500;state.board.deadline=252500;state.board.firstPlacementDeadline=null;
  const finished=applySolo(state,{type:'collect'},3500);
  expect(finished.presentation?.startedAt).toBe(7300);
  expect(finished.presentation?.endsAt).toBe(12300);
  expect(advanceSolo(finished,12299).round).toBe(1);
  expect(advanceSolo(finished,12300).round).toBe(2);
 });
 it('rejects pauses and early actions; abandonment is not completion',()=>{
  const state=createSoloRun(row,0);
  expect(()=>applySolo(state,{type:'place',column:0},1)).toThrow('round_intro');
  expect(()=>applySolo(state,{type:'pause'} as never,2500)).toThrow('invalid_action');
  expect(applySolo(state,{type:'abandon'},0).status).toBe('abandoned');
 });
 it('freezes competitive settings and never projects the hidden deck',()=>{
  const state=createSoloRun(row,0);expect(state.config).not.toBe(config);
  const view=soloProjection({...row,state},'You',0);
  expect(JSON.stringify(view)).not.toContain('"deck"');expect(JSON.stringify(view)).not.toContain('sessionId');
  expect(view.view.boards[row.user_id]?.current).toEqual(state.deck[0]);
 });
});

