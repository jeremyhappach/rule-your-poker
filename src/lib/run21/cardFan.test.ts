import {describe,it,expect} from 'vitest';
import {DEFAULT_CARD_FRONT_DESIGN,resolveCardFrontStyle,type DeckFaceMode} from '@/lib/cardFrontDesign/config';
import {cardFan} from './cardFan';
describe('Run21 rank-preserving overlap',()=>{
  it.each(['two-color','four-color'] as DeckFaceMode[])('fits ranks and 2:3 cards for %s',mode=>{
    for(const height of [48,90,180])for(const count of [1,2,3,4,5,6,11]){
      const fan=cardFan(48,height,count,DEFAULT_CARD_FRONT_DESIGN,mode);
      const face=resolveCardFrontStyle(DEFAULT_CARD_FRONT_DESIGN,'medium',mode,fan.width,fan.height);
      const rankHeight=parseFloat(String(face.rankStyle.fontSize))*Number(face.rankStyle.lineHeight);
      const suit=face.suitStyle;
      const group=rankHeight+(suit?parseFloat(String(suit.fontSize))*Number(suit.lineHeight)+parseFloat(String(suit.marginTop)):0);
      const rankBottom=(fan.height-group)/2+rankHeight;
      expect(fan.step).toBeGreaterThan(rankBottom);
      expect(fan.step).toBeLessThan(fan.height);
      expect(fan.contentHeight<=height+.01||parseFloat(String(face.rankStyle.fontSize))>=12).toBe(true);
      expect(fan.height/fan.width).toBeCloseTo(1.5);
    }
  });
  it('reserves configured rank offsets without altering canonical faces',()=>{
    const config=structuredClone(DEFAULT_CARD_FRONT_DESIGN);
    config.tiers.medium.fourColor.rankOffsetYPctOfCardHeight=10;
    const original=cardFan(50,200,4,DEFAULT_CARD_FRONT_DESIGN,'four-color');
    const shifted=cardFan(50,200,4,config,'four-color');
    expect(shifted.width).toBeLessThan(original.width);
    expect(shifted.step/shifted.height).toBeGreaterThan(original.step/original.height);
  });
});
