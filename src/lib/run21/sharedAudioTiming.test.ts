import {describe,it,expect} from 'vitest';
import {RUN21_RULES,RUN21_RULESETS,medalDuration} from './rulesets';
import {duration,scoreBoard} from './rules';
import {createSoloRun,applySolo,advanceSolo} from '../arcade/run21';
import {PLAYERS,uuid} from './fixtures';
import type {RunRecord} from '../arcade/model';
import {celebrationCueAt} from '../audio/celebrationCue';
import {triAllClearCueAt} from '../triTowers/allClearCue';
import {cardSwooshCueAt} from '../audio/cardSwoosh';
import {triSwooshCueAt} from '../triTowers/cardSwoosh';

describe('shared audio and frozen medal timing',()=>{
 it('reuses exactly the approved TriTowers sound generators',()=>{
  expect(celebrationCueAt).toBe(triAllClearCueAt);expect(cardSwooshCueAt).toBe(triSwooshCueAt);
 });
 it.each([104,105] as const)('preserves score and full count-up for a banked %i in both versions',aggregate=>{
  const scores=[];
  for(const preset of ['run21/2','run21/3']){
   const rules=RUN21_RULESETS[preset],medal=medalDuration(rules,aggregate);
   const config={...rules,roundDurationMs:duration(rules),scorePresentationMs:5000,silverCelebrationMs:medalDuration(rules,104),goldCelebrationMs:medalDuration(rules,105)};
   const row:RunRecord={id:uuid(32),user_id:PLAYERS[0].id,game:'run21',ruleset:preset,config,revision:0,state:null,status:'active',created_at:new Date(0).toISOString(),server_at:0};
   const s=createSoloRun(row,0);
   s.board.columns=Array.from({length:5},(_,i)=>[{rank:'K',suit:'hearts'},{rank:i===4&&aggregate===104?'10':'A',suit:'spades'}]);
   const expected=scoreBoard(s.board,rules,'collect',3000),done=applySolo(s,{type:'collect'},3000);
   scores.push(done.score);expect(done.results[0]).toEqual(expected);
   expect(done.presentation!.startedAt).toBe(3000+medal);expect(done.presentation!.endsAt-done.presentation!.startedAt).toBe(5000);
   expect(advanceSolo(done,done.presentation!.endsAt-1).round).toBe(1);
   expect(advanceSolo(done,done.presentation!.endsAt).round).toBe(2);
  }
  expect(scores[0]).toBe(scores[1]);
 });
 it('changes only the medal lifecycle, retaining every gameplay parameter',()=>{
  const {preset,silverCelebrationMs,goldCelebrationMs,...rules}=RUN21_RULES;
  const {preset:old,...legacy}=RUN21_RULESETS['run21/2'];
  expect(rules).toEqual(legacy);expect(silverCelebrationMs).toBe(3000);expect(goldCelebrationMs).toBe(3800);
  expect(medalDuration(RUN21_RULESETS['run21/2'],104)).toBe(2800);
 });
});
