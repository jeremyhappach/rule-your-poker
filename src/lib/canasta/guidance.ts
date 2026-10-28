import {rulesFor,openingReport,pileStatus,canastas,wild,standard,meldError,type Meld} from './rules';
import type {PhysicalCard} from '../cardGames/physicalCard';
export interface GuidanceView {hand:PhysicalCard[];pile:PhysicalCard[];melds:Meld[];score:number;opened:boolean;phase:'draw'|'meld'|'ended';stockCount?:number;pileCount?:number;pileFrozen?:boolean;source?:'stock'|'pile'|null;version:string}
export function pickupGroups(v:GuidanceView,selected:string[],drafts:Meld[]) {
 const top=v.pile.at(-1),rank=top&&standard(top)?.rank;
 return !top||!rank?[]:[...drafts.filter(g=>g.rank!==rank),{rank,cards:[...(drafts.find(g=>g.rank===rank)?.cards??v.hand.filter(c=>selected.includes(c.id))),top]}];
}
/** Advisory only: uses the admitted rule module, never a second legality engine. */
export function canastaGuidance(v:GuidanceView,selected:string[],drafts:Meld[],discard:string|null){
 const rules=rulesFor(v.version),status=pileStatus(v.pile,v.opened),frozen=v.pileFrozen??status.globalFreeze;
 const opening=openingReport(drafts,v.score),groups=pickupGroups(v,selected,drafts);
 const pickupError=rules.pickupError({hand:v.hand,pile:v.pile,pileCount:v.pileCount,pileFrozen:frozen,opened:v.opened,score:v.score,existing:v.melds,qualifierIds:selected,opening:v.opened?[]:groups});
 const finish=rules.turnPlan({hand:v.hand,existing:v.melds,drafts,discardId:discard,opened:v.opened,score:v.score,drawSource:v.source??undefined});
 const noDiscard=rules.turnPlan({hand:v.hand,existing:v.melds,drafts,discardId:null,opened:v.opened,score:v.score,drawSource:v.source??undefined});
 const top=v.pile.at(-1),mandatory=!v.stockCount&&!status.blocked&&!frozen&&v.opened&&v.melds.some(m=>m.rank===standard(top!)?.rank)&&!(v.hand.length===1&&(v.pileCount??v.pile.length)===1);
 const instruction=v.phase==='ended'?'Hand complete.':v.phase==='draw'?(v.stockCount?'Draw '+Math.min(2,v.stockCount)+' cards'+(!status.blocked?' or qualify to take the discard pile.':'. The top discard blocks pickup.'):mandatory?'Stock empty. You must take the discard pile.':'Stock empty. Take a qualifying pile or end this hand.'):
 !finish.error&&finish.out?'Your prepared cards can go out. Submit to confirm.':drafts.length&&!v.opened?'Opening needs '+opening.required+' points; your draft totals '+opening.count+'.':'Select cards to meld, or choose one card to discard and end your turn.';
 const melds=v.melds.map(m=>({rank:m.rank,count:m.cards.length,kind:m.cards.length>=7&&!meldError(m)?(m.cards.some(wild)?'Mixed canasta':'Natural canasta'):'Meld'}));
 return {instruction,opening,pickupError,finish,noDiscard,mandatory,canastas:canastas(v.melds),required:rules.contract.requiredCanastas,melds,
 pileReason:status.blocked?'Top card blocks pickup':frozen?'Frozen: two matching natural cards required':!v.opened?'Before opening: two matching natural cards and the opening minimum required':'Top card must join a qualifying meld'};
}
