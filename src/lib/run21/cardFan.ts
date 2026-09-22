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

/** Fit ordinary columns; long stacks retain readable ranks and scroll locally. */
export function cardFan(width:number,height:number,count:number,config:CardFrontDesignConfig,mode:DeckFaceMode){
  let low=0,high=Math.max(0,Math.min(width,height/1.5));
  for(let i=0;i<24;i++){
    const candidate=(low+high)/2;
    if(candidate*1.5+Math.max(0,count-1)*rankExposure(candidate,config,mode)<=height)low=candidate;
    else high=candidate;
  }
  const policy=mode==='four-color'?config.tiers.medium.fourColor:config.tiers.medium.twoColor;
  const readableWidth=12/Math.max(.01,policy.rankScalePctOfCardWidth/100);
  const cardWidth=Math.max(low,Math.min(width,readableWidth));
  const cardHeight=cardWidth*1.5,step=rankExposure(cardWidth,config,mode);
  return {width:cardWidth,height:cardHeight,step,contentHeight:cardHeight+Math.max(0,count-1)*step};
}
