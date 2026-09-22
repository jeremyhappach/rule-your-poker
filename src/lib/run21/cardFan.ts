import {resolveCardFrontStyle,type CardFrontDesignConfig,type DeckFaceMode} from '@/lib/cardFrontDesign/config';

/** Expose the canonical rank, including its glyph overhang, before the next card. */
export function rankExposure(width:number,config:CardFrontDesignConfig,mode:DeckFaceMode):number {
  const height=width*1.5,face=resolveCardFrontStyle(config,'medium',mode,width,height);
  const rank=parseFloat(String(face.rankStyle.fontSize)),rankLine=rank*Number(face.rankStyle.lineHeight);
  const suit=face.suitStyle;
  const group=rankLine+(suit?parseFloat(String(suit.fontSize))*Number(suit.lineHeight)+parseFloat(String(suit.marginTop)):0);
  const tier=config.tiers.medium;
  const offset=mode==='four-color'?tier.fourColor.rankOffsetYPctOfCardHeight:tier.twoColor.groupOffsetYPctOfCardHeight;
  return Math.min(height,Math.max(0,height/2-group/2+rankLine+offset/100*height+rank*.16+1));
}

/** Geometry alone fixes card size. Depth changes only the overlap, never the card. */
export function cardFan(width:number,height:number,count:number,config:CardFrontDesignConfig,mode:DeckFaceMode){
  // At most 11 cards can be placed before a standard-deck column locks or busts.
  // Reserve a slim visible edge for that maximum while keeping the newest face whole.
  const cardWidth=Math.max(0,Math.min(width,height/(1.5+10*.06)));
  const cardHeight=cardWidth*1.5,available=Math.max(0,height-cardHeight);
  const step=Math.min(rankExposure(cardWidth,config,mode),available/Math.max(1,count-1));
  return {width:cardWidth,height:cardHeight,step,contentHeight:cardHeight+Math.max(0,count-1)*step};
}
