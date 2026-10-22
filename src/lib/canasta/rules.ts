import type { Card, Rank, Suit } from '../cardUtils';
import { isResolvedJoker, type PhysicalCard } from '../cardGames/physicalCard';

export const VERSION = 'canasta-classic-two/1' as const;
export const CONTRACT = Object.freeze({ version: VERSION, participants: 2, deckSize: 108,
  handSize: 15, drawCount: 2, requiredCanastas: 2, target: 5000, turnMs: 120000 });
const ranks: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const suits: Suit[] = ['♣','♦','♥','♠'];
export type Meld = { rank: Rank; cards: PhysicalCard[] };
export const standard = (c: PhysicalCard): Card | null => isResolvedJoker(c.face) ? null : c.face as Card;
export const wild = (c: PhysicalCard) => isResolvedJoker(c.face) || standard(c)?.rank === '2';
export const redThree = (c: PhysicalCard) => standard(c)?.rank === '3' && ['♥','♦'].includes(standard(c)!.suit);
export const natural = (c: PhysicalCard) => !wild(c) && standard(c)?.rank !== '3';
export const points = (c: PhysicalCard) => isResolvedJoker(c.face) ? 50
  : ['A','2'].includes(standard(c)!.rank) ? 20
  : ['8','9','10','J','Q','K'].includes(standard(c)!.rank) ? 10 : 5;
export const openingMinimum = (score: number) => score < 0 ? 15 : score < 1500 ? 50 : score < 3000 ? 90 : 120;
export function initialPile(deck:PhysicalCard[]) {
  const stock=[...deck],pile:PhysicalCard[]=[];
  while(stock.length){const c=stock.shift()!;pile.push(c);if(!wild(c)&&!redThree(c))break;}
  return {stock,pile};
}
export function stockDraw(deck:PhysicalCard[]) {
  const stock=[...deck],cards:PhysicalCard[]=[],reds:PhysicalCard[]=[];
  while(stock.length&&cards.length<2){const c=stock.shift()!;(redThree(c)?reds:cards).push(c);}
  return {stock,cards,reds,endsImmediately:cards.length===0};
}
export function handScore(melds:Meld[],hand:PhysicalCard[],redCount:number,out:'none'|'ordinary'|'concealed') {
  const meldValue=melds.flatMap(m=>m.cards).reduce((n,c)=>n+points(c),0);
  const handValue=hand.reduce((n,c)=>n+points(c),0);
  const bonuses=melds.filter(m=>m.rank!=='3'&&m.cards.length>=7).reduce((n,m)=>n+(m.cards.some(wild)?300:500),0);
  const reds=(redCount===4?800:redCount*100)*(melds.length?1:-1);
  return meldValue-handValue+bonuses+reds+(out==='concealed'?200:out==='ordinary'?100:0);
}
export function compareCards(a: PhysicalCard, b: PhysicalCard): number {
  const x = standard(a), y = standard(b);
  return (x ? ranks.indexOf(x.rank) : 13) - (y ? ranks.indexOf(y.rank) : 13)
    || (x ? suits.indexOf(x.suit) : 4) - (y ? suits.indexOf(y.suit) : 4)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Fixture IDs only. Production admission must supply opaque random identities. */
export function fixtureDeck(): PhysicalCard[] {
  return [0,1].flatMap(copy => [
    ...suits.flatMap(suit => ranks.map(rank => ({id:`fixture-${copy}-${suits.indexOf(suit)}-${rank}`,face:{rank,suit}}))),
    ...[0,1].map(n => ({id:`fixture-joker-${copy}-${n}`,face:{kind:'joker' as const}})),
  ]);
}
export function meldError(m: Meld, goingOut = false): string | null {
  if (new Set(m.cards.map(c=>c.id)).size !== m.cards.length) return 'A physical card was used twice.';
  if (m.rank === '3') return goingOut && [3,4].includes(m.cards.length)
    && m.cards.every(c=>standard(c)?.rank==='3' && !redThree(c)) ? null : 'Black threes meld only when going out.';
  if (m.rank === '2' || m.cards.length < 3) return 'A meld needs at least three cards.';
  const naturals = m.cards.filter(c=>!wild(c));
  if (naturals.length < 2 || naturals.some(c=>standard(c)?.rank!==m.rank || redThree(c))) return 'Use at least two matching natural cards.';
  if (m.cards.filter(wild).length > 3) return 'At most three wild cards per meld.';
  return null;
}
export const canastas = (melds: Meld[]) => melds.filter(m=>m.rank!=='3' && m.cards.length>=7 && !meldError(m)).length;
export function openingReport(melds: Meld[], score: number, goingOut = false) {
  const ids = melds.flatMap(m=>m.cards.map(c=>c.id));
  const error = new Set(ids).size !== ids.length ? 'A card appears in more than one meld.'
    : new Set(melds.map(m=>m.rank)).size!==melds.length ? 'Combine melds of the same rank.'
    : melds.map(m=>meldError(m,goingOut)).find(Boolean) ?? null;
  return { count: melds.flatMap(m=>m.cards).reduce((n,c)=>n+points(c),0), required: openingMinimum(score), error };
}
export function pileStatus(pile: PhysicalCard[], opened: boolean) {
  const top = pile.at(-1);
  return { blocked: !top || !natural(top), globalFreeze: pile.some(c=>wild(c)||redThree(c)),
    personalFreeze: !opened };
}
/** Does not consult timeout policy, and does not reject a legal pickup for timeout convenience. */
export function pickupError(input: {
  hand: PhysicalCard[]; pile: PhysicalCard[]; opened: boolean; score: number;
  existing: Meld[]; qualifierIds: string[]; opening: Meld[];
}): string | null {
  const {hand,pile,opened,score,existing,qualifierIds,opening} = input;
  const status=pileStatus(pile,opened), top=pile.at(-1);
  if (status.blocked || !top) return 'The top card blocks pickup.';
  if (hand.length===1 && pile.length===1) return 'A one-card hand cannot take a one-card pile.';
  if (new Set(qualifierIds).size!==qualifierIds.length) return 'Select distinct physical cards.';
  const q=qualifierIds.map(id=>hand.find(c=>c.id===id));
  if (q.some(c=>!c)) return 'Qualifier is not in your hand.';
  const rank=standard(top)!.rank;
  const matching=q.filter(c=>c && natural(c) && standard(c)?.rank===rank).length;
  const pair=q.length===2 && matching===2;
  const frozen=status.globalFreeze||status.personalFreeze;
  if (frozen && !pair) return 'Frozen pile: select two matching natural cards.';
  if (!frozen && !(pair || (q.length===2 && matching===1 && q.some(c=>c && wild(c)))
    || (q.length===0 && existing.some(m=>m.rank===rank)))) return 'The top card must join a qualifying meld.';
  if (!opened) {
    const permitted=new Set([...hand.map(c=>c.id),top.id]);
    if (opening.flatMap(m=>m.cards).some(c=>!permitted.has(c.id))) return 'Buried cards cannot qualify an opening.';
    const topMeld=opening.find(m=>m.rank===rank);
    if (!topMeld || ![top.id,...qualifierIds].every(id=>topMeld.cards.some(c=>c.id===id))) return 'Include the top card and its pair in the opening.';
    const report=openingReport(opening,score);
    if (report.error) return report.error;
    if (report.count<report.required) return `Opening needs ${report.required}; eligible count is ${report.count}.`;
  }
  return null;
}
export type MechanicalFinish = {kind:'discard'; cardId:string}|{kind:'meld-out';cardId:string;rank:Rank}|{kind:'pause-recovery'};
/** Shared advisory/authority predicate. UI never owns a second legality implementation. */
export function turnPlan(input:{hand:PhysicalCard[];existing:Meld[];drafts:Meld[];discardId:string|null;opened:boolean;score:number;drawSource?:'stock'|'pile'}) {
  const {hand,existing,drafts,discardId,opened,score}=input;
  const ids=drafts.flatMap(m=>m.cards.map(c=>c.id));
  const used=new Set(ids), owned=new Set(hand.map(c=>c.id));
  let error:string|null=null;
  if(ids.length!==used.size||ids.some(id=>!owned.has(id)))error='Every submitted physical card must be owned and used once.';
  if(discardId && (!owned.has(discardId)||used.has(discardId)))error='Choose one unmelded card as your discard.';
  if(discardId && hand.some(c=>c.id===discardId&&redThree(c)))error='Red threes cannot be discarded.';
  const melds=existing.map(m=>({...m,cards:[...m.cards]}));
  for(const m of drafts){const old=melds.find(x=>x.rank===m.rank);if(old)old.cards.push(...m.cards);else melds.push({...m,cards:[...m.cards]});}
  const remaining=hand.filter(c=>!used.has(c.id)&&c.id!==discardId);
  const out=remaining.length===0;
  error=error??melds.map(m=>meldError(m,out)).find(Boolean)??null;
  if(out&&canastas(melds)<2)error='You need two canastas to go out. Keep a card after discarding.';
  if(!out&&!discardId)error='Choose a discard to finish the turn.';
  const report=openingReport(drafts,score,out);
  const concealedStockOut=!opened&&out&&canastas(melds)>=2&&input.drawSource==='stock';
  if(!opened&&drafts.length&&report.count<report.required&&!concealedStockOut)error=`Opening needs ${report.required}; draft has ${report.count}.`;
  return {error,melds,remaining,out};
}
/** Deliberately incomplete planner: inability to finish preserves state and pauses. */
export function mechanicalFinish(hand: PhysicalCard[], melds: Meld[]): MechanicalFinish {
  const candidates=hand.filter(c=>!redThree(c)).sort(compareCards);
  if (hand.length>1 || canastas(melds)>=2) {
    if (candidates[0]) return {kind:'discard',cardId:candidates[0].id};
  }
  if (hand.length===1) {
    for (const m of [...melds].sort((a,b)=>ranks.indexOf(a.rank)-ranks.indexOf(b.rank))) {
      const next={...m,cards:[...m.cards,hand[0]]};
      if (!meldError(next,true) && canastas(melds.map(old=>old===m?next:old))>=2)
        return {kind:'meld-out',cardId:hand[0].id,rank:m.rank};
    }
  }
  return {kind:'pause-recovery'};
}
/** Fail closed on unknown admitted versions; extend through a new immutable module. */
export function rulesFor(version: string) {
  if (version!==VERSION) throw new Error(`Unsupported Canasta rules: ${version}`);
  return {contract:CONTRACT,initialPile,stockDraw,handScore,openingReport,pickupError,turnPlan,mechanicalFinish};
}
