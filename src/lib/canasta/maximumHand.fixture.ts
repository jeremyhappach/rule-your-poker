import {fixtureDeck,redThree,wild,standard,rulesFor,VERSION,type Meld} from './rules';

/** Executable legal witness, not a second reducer. Every move uses shared predicates. */
export function maximumHandWitness() {
  const rules=rulesFor(VERSION), deck=fixtureDeck();
  const reds=deck.filter(redThree), wilds=deck.filter(wild);
  let pool=deck.filter(c=>!redThree(c)&&!wild(c));
  const aces=pool.filter(c=>standard(c)?.rank==='A').slice(0,4);
  pool=pool.filter(c=>!aces.includes(c));
  let a=[...aces.slice(0,2),...pool.splice(0,13)],b=[aces[2],...pool.splice(0,14)];
  // Deal includes the four exposed red threes, replaced before turn admission.
  const initial=rules.initialPile([...wilds,aces[3],...pool]);
  let stock=initial.stock,pile=initial.pile,melds:Meld[]=[];
  const trace:{turn:number;a:number;b:number;stock:number;pile:number}[]=[];
  const check=()=>{
    const cards=[...a,...b,...stock,...pile,...reds,...melds.flatMap(m=>m.cards)];
    if(cards.length!==108||new Set(cards.map(c=>c.id)).size!==108)throw Error('Card conservation failed');
  };
  check();
  for(let turn=1;turn<=31;turn++){
    const isB=turn%2===1,draw=rules.stockDraw(stock);
    if(draw.endsImmediately||draw.reds.length)throw Error('Unexpected draw in witness');
    stock=draw.stock;
    const hand=[...(isB?b:a),...draw.cards];
    const discard=turn===31?aces[2]:hand.find(c=>isB?c.id!==aces[2].id:!aces.slice(0,2).some(x=>x.id===c.id))!;
    const plan=rules.turnPlan({hand,existing:[],drafts:[],discardId:discard.id,opened:false,score:0,drawSource:'stock'});
    if(plan.error)throw Error(plan.error);
    if(isB)b=plan.remaining;else a=plan.remaining;
    pile.push(discard);check();
    trace.push({turn,a:a.length,b:b.length,stock:stock.length,pile:pile.length});
  }
  const beforePickup={hand:[...a],pile:[...pile],opponent:[...b],stock:[...stock]};
  const top=pile.at(-1)!;
  melds=[{rank:'A',cards:[...aces.slice(0,2),top]}];
  const error=rules.pickupError({hand:a,pile,opened:false,score:0,existing:[],qualifierIds:aces.slice(0,2).map(c=>c.id),opening:melds});
  if(error)throw Error(error);
  const committed=new Set(melds.flatMap(m=>m.cards.map(c=>c.id)));
  a=[...a.filter(c=>!committed.has(c.id)),...pile.slice(0,-1)];pile=[];check();
  const hand=[...a];
  const discard=a.find(c=>!redThree(c))!;
  const finish=rules.turnPlan({hand:a,existing:melds,drafts:[],discardId:discard.id,opened:true,score:0,drawSource:'pile'});
  if(finish.error)throw Error(finish.error);
  a=finish.remaining;pile=[discard];check();
  return {hand,melds,opponent:b,reds,stock,trace,beforePickup,afterDiscard:a,discard};
}

/** Count-relaxation proof; rank restrictions can only reduce its upper bound. */
export function maximumHandCountBound() {
  let pickup=0,stockAfterPickup=0;
  // At least 61 usable stock cards after setup (at most 12 wilds + one stop card).
  for(let remaining=0;remaining<=73;remaining++){
    const draws=Math.max(0,Math.ceil((61-remaining)/2));
    pickup=Math.max(pickup,104-(17+Math.ceil(draws/2)+remaining));
    stockAfterPickup=Math.max(stockAfterPickup,104-(19+Math.ceil((draws-1)/2)+remaining));
  }
  return {pickup,stockAfterPickup,stockWithoutPickup:53,completedTurn:pickup-1};
}
