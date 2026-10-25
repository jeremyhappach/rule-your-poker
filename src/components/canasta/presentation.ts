import {compareCards, wild, type Meld} from '@/lib/canasta/rules';
import {isResolvedJoker, type PhysicalCard} from '@/lib/cardGames/physicalCard';
import type {Rank} from '@/lib/cardUtils';

const ranks:Rank[]=['A','3','4','5','6','7','8','9','10','J','Q','K','2'];
/** Display order only. Mechanical completion retains the frozen rule comparator. */
export function compareHandCards(a:PhysicalCard,b:PhysicalCard){
  const order=(c:PhysicalCard)=>isResolvedJoker(c.face)?12:c.face.rank==='2'?13:ranks.indexOf(c.face.rank);
  return order(a)-order(b)||compareCards(a,b);
}
export function canastaLabel(meld:Meld){
  return meld.rank!=='3'&&meld.cards.length>=7?(meld.cards.some(wild)?'Mixed canasta':'Natural canasta'):null;
}
/** Committed canastas precede rank-sorted ordinary melds and local draft groups. */
export function orderedMeldRanks(committed:Meld[],drafts:Meld[]=[]):Rank[]{
  const completed=new Set(committed.filter(m=>canastaLabel(m)).map(m=>m.rank));
  return [...new Set([...committed,...drafts].map(m=>m.rank))].sort((a,b)=>
    Number(completed.has(b))-Number(completed.has(a))||ranks.indexOf(a)-ranks.indexOf(b));
}
