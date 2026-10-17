import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {RUN21_RULES,RUN21_RULESET,RUN21_RULESETS,assertSharedRules} from './rulesets';
import {fixtureDeck,fixtureMatch,act,PLAYERS,uuid} from './fixtures';
import {advanceScorePresentation,applyCommand} from './engine';
import {createSoloRun,applySolo,advanceSolo} from '../arcade/run21';
import {canCollect,legalColumns,duration,speedAt} from './rules';
import type {RunRecord} from '../arcade/model';
const config={...RUN21_RULES,roundDurationMs:duration(RUN21_RULES),scorePresentationMs:5000,silverCelebrationMs:3000,goldCelebrationMs:3800};
const row:RunRecord={id:uuid(22),user_id:PLAYERS[0].id,game:'run21',ruleset:RUN21_RULESET,config,revision:0,state:null,status:'active',created_at:new Date(0).toISOString(),server_at:0};
describe('mode-neutral Run21 rules',()=>{
 it('shares legal actions, card sequence, clock and scores across 50 decks',()=>{
  for(let seed=1;seed<=50;seed++){
   const deck=fixtureDeck([],seed).cards;
   let solo=createSoloRun(row,0,()=>deck),match=act(fixtureMatch(RUN21_RULES,[],seed),PLAYERS[0].id,{type:'ready'},0);
   for(let n=0;n<53&&!solo.board.result;n++){
    const columns=legalColumns(solo.board,config),at=2500+n*499;
    const intent=canCollect(solo.board,config)?{type:'collect' as const}:n===1?{type:'pass' as const}:{type:'place' as const,column:columns[(seed+n)%columns.length]};
    solo=applySolo(solo,intent,at);match=act(match,PLAYERS[0].id,intent,at);
    const board=match.rounds[0].boards[PLAYERS[0].id];
    expect({...solo.board,revision:0}).toEqual({...board,revision:0});
   }
   expect(solo.score).toBe(match.cumulative[PLAYERS[0].id]);
  }
 });
 it('starts each multiplayer participant clock at their own intro end and times out untouched boards',()=>{
  const id=PLAYERS[0].id;
  let match=act(fixtureMatch(RUN21_RULES),id,{type:'ready'},0);
  expect(match.rounds[0].boards[id].startedAt).toBe(2500);expect(match.rounds[0].boards[PLAYERS[1].id].startedAt).toBeNull();
  const cmd={identity:match.identity,roundId:match.rounds[0].id,playerId:id,requestId:uuid(91),revision:match.rounds[0].boards[id].revision,intent:{type:'place' as const,column:0}};
  const expired=applyCommand(match,cmd,{kind:'player',playerId:id},109300);expect(expired.status).toBe('accepted');
  expect(expired.state.rounds[0].boards[id].result).toMatchObject({reason:'timeout',score:0,at:109300});
  match=advanceScorePresentation(expired.state,114300);
  expect(match.rounds[0].boards[PLAYERS[1].id].startedAt).toBe(116800);
  const solo=advanceSolo(createSoloRun(row,0),109300);expect(solo.board.result).toEqual(expired.state.rounds[0].boards[id].result);
 });
 it('uses the same configured boundary values and rejects independently tuned shared configs',()=>{
  const board=createSoloRun(row,0).board;
  for(const [t,n]of [[0,280],[419,280],[420,278],[16799,202],[16800,200],[17699,200],[17700,198],[106799,2],[106800,0]])expect(speedAt(board,RUN21_RULES,2500+t)).toBe(n);
  expect(()=>assertSharedRules({...RUN21_RULES,speed:{...RUN21_RULES.speed,start:282}})).toThrow('ruleset_conflict');
  const sql=readFileSync('supabase/run21/shared-rules.candidate.sql','utf8');
  expect(JSON.parse(sql.match(/\$rules\$([\s\S]*?)\$rules\$/)![1])).toEqual(RUN21_RULESETS['run21/2']);
 });
});
