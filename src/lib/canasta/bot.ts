import type {Action,Projection,Group} from './engine';
import {standard,natural,wild,points,compareCards,pickupError,turnPlan,pileStatus,type Meld} from './rules';

/** Bounded own-hand/public-information policy, also used by approved fake-money autoplay. */
export function chooseBotAction(view:Projection):Action|null {
  const h=view.hand;if(!h||view.pause||view.winner||h.phase==='complete'||h.active!==view.viewer)return null;
  const p=h.players[h.active],hand=p.cards;if(!hand)return null;
  const top=h.pile.at(-1);
  if(h.phase==='draw'){
    if(top&&natural(top)){
      const rank=standard(top)!.rank,pair=hand.filter(c=>natural(c)&&standard(c)?.rank===rank).slice(0,2);
      const qualifiers=p.opened&&!pileStatus(h.pile,true).globalFreeze&&p.melds.some(g=>g.rank===rank)?[]:pair.map(c=>c.id);
      const opening:Meld[]=p.opened?[]:[{rank,cards:[...pair,top]}];
      if(!p.opened)for(const r of ['A','4','5','6','7','8','9','10','J','Q','K'] as const){
        if(r===rank)continue;const cards=hand.filter(c=>natural(c)&&standard(c)?.rank===r);if(cards.length>=3)opening.push({rank:r,cards});
      }
      if(!pickupError({hand,pile:h.pile,opened:p.opened,score:p.openingScore,existing:p.melds,qualifierIds:qualifiers,opening}))
        return {type:'pickup',qualifiers,opening:opening.map(g=>({rank:g.rank,ids:g.cards.map(c=>c.id)}))};
    }
    return h.stockCount?{type:'draw'}:{type:'end-exhausted'};
  }
  const drafts:Meld[]=[];let wilds=hand.filter(wild).sort(compareCards);
  for(const rank of ['A','4','5','6','7','8','9','10','J','Q','K'] as const){
    const old=p.melds.find(g=>g.rank===rank),cards=hand.filter(c=>natural(c)&&standard(c)?.rank===rank);
    if(old||cards.length>=2){
      const need=Math.max(0,(old?7:3)-(old?.cards.length??0)-cards.length);
      const take=Math.min(need,3-(old?.cards.filter(wild).length??0),wilds.length);
      if(old||cards.length+take>=3){cards.push(...wilds.splice(0,take));if(cards.length)drafts.push({rank,cards});}
    }
  }
  const plans=[drafts,[]];
  for(const groups of plans){
    const operands:Group[]=groups.map(g=>({rank:g.rank,ids:g.cards.map(c=>c.id)}));
    // Prefer a legal exit, otherwise discard the highest residual penalty card.
    for(const discard of [null,...[...hand].sort((a,b)=>points(b)-points(a)||compareCards(a,b)).map(c=>c.id)]){
      if(!turnPlan({hand,existing:p.melds,drafts:groups,discardId:discard,opened:p.opened,score:p.openingScore,drawSource:h.source??undefined}).error)
        return {type:'finish',groups:operands,discard};
    }
  }
  return null;
}
