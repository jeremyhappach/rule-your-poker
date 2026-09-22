import {describe,it,expect} from 'vitest';
import {DEFAULT_CARD_FRONT_DESIGN,type DeckFaceMode} from '@/lib/cardFrontDesign/config';
import {cardFan} from './cardFan';
import {standardDeck} from './rules';
describe('Run21 fixed card geometry',()=>{
 it.each(['two-color','four-color'] as DeckFaceMode[])('keeps equal 2:3 boxes at every legal depth without overflow (%s)',mode=>{
  for(const width of [24,48,90])for(const height of [48,90,180]){
   const first=cardFan(width,height,1,DEFAULT_CARD_FRONT_DESIGN,mode);
   for(let count=1;count<=11;count++){
    const fan=cardFan(width,height,count,DEFAULT_CARD_FRONT_DESIGN,mode);
    expect(fan.width).toBe(first.width);expect(fan.height).toBe(first.height);
    expect(fan.height/fan.width).toBeCloseTo(1.5);
    expect(fan.contentHeight).toBeLessThanOrEqual(height+.001);
    expect(fan.step).toBeGreaterThanOrEqual(fan.width*.06-.001);
   }
  }
 });
 it('bounds possible depth at eleven before a column necessarily locks or busts',()=>{
  const smallest=standardDeck().map(c=>c.rank==='A'?1:['J','Q','K'].includes(c.rank)?10:Number(c.rank)).sort((a,b)=>a-b);
  expect(smallest.slice(0,10).reduce((a,b)=>a+b,0)).toBe(18);
  expect(smallest.slice(0,11).reduce((a,b)=>a+b,0)).toBe(21);
 });
 it('uses configured rank offsets only for spacing',()=>{
  const config=structuredClone(DEFAULT_CARD_FRONT_DESIGN);config.tiers.medium.fourColor.rankOffsetYPctOfCardHeight=10;
  const first=cardFan(50,400,4,DEFAULT_CARD_FRONT_DESIGN,'four-color'),shifted=cardFan(50,400,4,config,'four-color');
  expect(shifted.width).toBe(first.width);expect(shifted.height).toBe(first.height);expect(shifted.step).toBeGreaterThan(first.step);
 });
});
