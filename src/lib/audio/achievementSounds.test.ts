import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isFiveOnes,legAwardSound,sweepOwnsCelebration,yahtzeePostedSound} from './achievementSounds';
import type {YahtzeeState} from '@/lib/yahtzeeTypes';
const local='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
it('uses the exact nine owner-selected recordings',()=>{
  const picks=JSON.parse(readFileSync('dev/sound-studio-v2/owner-selection.json','utf8')).picks;
  expect(picks).toHaveLength(9);
  for(const pick of picks)expect(createHash('sha256').update(readFileSync('src/assets/audio/'+pick.file)).digest('hex')).toBe(pick.sha256);
});
it('requires five actual ones, not a wild-assisted five of another value',()=>{
  expect(isFiveOnes([1,1,1,1,1].map(value=>({value})))).toBe(true);
  for(const values of [[1,1,6,6,6],[1,1,1,1],[0,0,0,0,0]])expect(isFiveOnes(values.map(value=>({value})))).toBe(false);
});
it.each([2,3,5])('attributes ordinary legs and reserves the authoritative sweep at target %i',targetLegs=>{
  expect(legAwardSound(local,local)).toBe('myLeg');expect(legAwardSound(other,local)).toBe('opponentLeg');
  expect(legAwardSound(other,null)).toBe('opponentLeg');
  const terminal={targetLegs,hadAuthoritativeLegs:true};
  expect(sweepOwnsCelebration(terminal)).toBe(true);
  expect(sweepOwnsCelebration({hadAuthoritativeLegs:false})).toBe(false);
  expect(sweepOwnsCelebration(null)).toBe(false);
});
it.each([
  ['yahtzee',50,50,[4,4,4,4,4],'yahtzee'],
  ['chance',20,50,[4,4,4,4,4],'yahtzee'],
  ['chance',20,0,[4,4,4,4,4],'scorePost'],
  ['yahtzee',0,0,[1,2,3,4,5],'scorePost'],
  ['ones',0,50,[2,2,3,4,5],'scorePost'],
] as const)('selects committed %s/%i with prior Yahtzee %i', (category,score,box,dice,expected)=>{
  const state={lastAction:{type:'score',playerId:local,sequence:8,category,score,dice:dice.map(value=>({value,isHeld:false}))},playerStates:{[local]:{scorecard:{scores:{yahtzee:box},yahtzeeBonuses:1}}}} as unknown as YahtzeeState;
  expect(yahtzeePostedSound(state)).toBe(expected);
});
