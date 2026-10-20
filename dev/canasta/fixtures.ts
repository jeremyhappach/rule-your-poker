import {maximumHandWitness} from '@/lib/canasta/maximumHand.fixture';
import { fixtureDeck, redThree, standard, wild, type Meld } from '@/lib/canasta/rules';
import type { PhysicalCard } from '@/lib/cardGames/physicalCard';
export const SELF='ca000000-0000-4000-8000-000000000001';
export const OTHER='ca000000-0000-4000-8000-000000000002';
const deck=fixtureDeck();
export type Scene='15'|'30'|'60'|'maximum'|'capacity'|'opening'|'frozen'|'out'|'reconnect';
export const SCENES: {id:Scene;label:string}[]=[
  {id:'15',label:'15 cards'},{id:'30',label:'30 cards'},{id:'60',label:'60 cards'},
  {id:'maximum',label:'71 cards · legal maximum'},
  {id:'capacity',label:'104-card stress bound'},{id:'opening',label:'Opening meld'},
  {id:'frozen',label:'Frozen pickup'},{id:'out',label:'Going out'},
  {id:'reconnect',label:'Committed pickup'},
];
export interface Fixture {
  hand:PhysicalCard[]; pile:PhysicalCard[]; melds:Meld[]; score:number; opened:boolean;
  phase:'draw'|'meld'|'ended'; notice:string; revision:number;
  drawSource?:'stock'|'pile'; stockCount?:number;
}
export function fixture(scene:Scene):Fixture {
  const live=deck.filter(c=>!redThree(c));
  const queens=live.filter(c=>standard(c)?.rank==='Q');
  const sevens=live.filter(c=>standard(c)?.rank==='7');
  const jokers=live.filter(c=>wild(c));
  const base:Fixture={hand:live.slice(0,15),pile:[queens[7]],melds:[],score:-25,opened:false,phase:'meld',
    notice:'Arrange your hand. Drafts are not committed.',revision:1,drawSource:'stock'};
  if(scene==='maximum'){
    const w=maximumHandWitness();
    return {...base,stockCount:0,hand:w.hand,pile:[],melds:w.melds,score:0,opened:true,drawSource:'pile',notice:'Legal maximum · 71 after pickup; 70 after discard.'};
  }
  if (['15','30','60','capacity'].includes(scene)) {
    const count=scene==='capacity'?104:Number(scene);
    // An adversarial layout bound, not a claimed legal full-game deal.
    const priority=[queens[0],queens[4],...jokers.slice(-2),...sevens.slice(0,3)];
    base.hand=[...priority,...live.filter(c=>!priority.includes(c))].slice(0,count);
    base.pile=live.filter(c=>!base.hand.includes(c)).slice(-1);
    base.notice=scene==='capacity'?'104-card stress bound, not a legal full-game deal.':`${count} cards · select by physical copy`;
  } else if (scene==='opening') {
    base.score=1600;
    base.hand=[...queens.slice(0,2),...sevens.slice(0,3),...jokers.slice(-2),...live.filter(c=>standard(c)?.rank==='J').slice(0,3)];
  } else if (scene==='frozen') {
    base.phase='draw';base.score=0;
    base.drawSource=undefined;
    base.hand=[...queens.slice(0,2),...sevens.slice(0,3),jokers[0],...live.filter(c=>standard(c)?.rank==='A').slice(0,3)];
    base.pile=[jokers.at(-1)!,...live.filter(c=>standard(c)?.rank==='8').slice(0,5),queens[7]];
    base.notice='Frozen pile · use two natural queens, plus enough opening cards.';
  } else if (scene==='out') {
    base.opened=true;
    base.melds=[{rank:'Q',cards:queens.slice(0,7)},{rank:'7',cards:sevens.slice(0,7)}];
    base.hand=[live.find(c=>standard(c)?.rank==='K')!];
    base.notice='Two canastas · select the final discard or meld it to go out.';
  } else {
    base.opened=true;base.revision=2;
    base.drawSource='pile';
    base.melds=[{rank:'Q',cards:queens.slice(0,3)}];
    base.hand=[...live.filter(c=>!queens.slice(0,3).includes(c))].slice(0,30);
    base.pile=[];base.notice='Pickup committed · 30 cards restored · no second draw.';
  }
  return base;
}
