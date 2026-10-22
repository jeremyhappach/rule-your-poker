import {describe,it,expect} from 'vitest';
import {createMatch,startHand,project,execute,expire,assertConservation,type Match,type Command} from './engine';
import {fixtureDeck,standard,redThree,type Meld} from './rules';
import {chooseBotAction} from './bot';
import {acceptSnapshot} from './client';
import {CanastaAuthority,type Store,type RecordState} from '../../../server/canasta/authority';
import {secureDeck} from '../../../server/canasta/shuffle';
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const seats=[{id:id(1),userId:id(3),kind:'human' as const,seat:1},{id:id(2),userId:id(4),kind:'human' as const,seat:5}];
const base=()=>startHand(createMatch({id:id(5),sessionId:id(6),stake:10,realMoney:false,seats},0),id(7),fixtureDeck(),0);
const cards=(rank:string)=>fixtureDeck().filter(c=>standard(c)?.rank===rank);
function boundary(hand:ReturnType<typeof fixtureDeck>,pile:ReturnType<typeof fixtureDeck>,stock:ReturnType<typeof fixtureDeck>=[],melds:Meld[]=[]){
  const m=base(),h=m.hand!,p=h.players[id(2)],used=new Set([...hand,...pile,...stock,...melds.flatMap(g=>g.cards)].map(c=>c.id));
  p.cards=hand;p.reds=[];p.melds=melds;p.opened=melds.length>0;h.openedAtTurnStart=p.opened;h.pile=pile;h.stock=stock;
  const other=h.players[id(1)];other.cards=fixtureDeck().filter(c=>!used.has(c.id)&&!redThree(c));other.reds=fixtureDeck().filter(c=>!used.has(c.id)&&redThree(c));
  assertConservation(m);return m;
}
describe('authority boundaries',()=>{
  it('secure shuffle uses independent opaque identities and a complete physical deck',()=>{
    const a=secureDeck(),b=secureDeck();expect(new Set(a.map(c=>c.id)).size).toBe(108);
    expect(a.some(c=>b.some(d=>d.id===c.id))).toBe(false);expect(a.every(c=>/^[0-9a-f-]{36}$/.test(c.id))).toBe(true);
  });
  it('takes mandatory exhausted pickup on timeout, while optional pickup ends without out bonus',()=>{
    const qs=cards('Q'),m=boundary([cards('4')[0],cards('5')[0]],[qs[3]],[],[{rank:'Q',cards:qs.slice(0,3)}]);
    const next=expire(m,120000,[id(1)]);expect(next.hand!.turn).toBe(2);expect(next.hand!.players[id(2)].melds[0].cards).toHaveLength(4);assertConservation(next);
    const optional=boundary([cards('Q')[0],cards('Q')[1]],[cards('Q')[2]]);
    const end=expire(optional,120000,[id(1)]);expect(end.hand!.phase).toBe('complete');expect(end.hand!.result?.out).toBeNull();
  });
  it('pauses without inventing melds when a legal committed pickup leaves one unplayable card',()=>{
    const m=boundary([cards('4')[0]],[],[],[{rank:'Q',cards:cards('Q').slice(0,3)}]);m.hand!.phase='meld';m.hand!.source='pile';
    const next=expire(m,120000,[id(1)]);expect(next.pause?.reason).toBe('recovery');expect(next.hand!.players[id(2)].cards).toEqual(m.hand!.players[id(2)].cards);
  });
  it.each([1,2])('ends immediately for %i final red threes without discarding',n=>{
    const m=boundary([cards('4')[0],cards('5')[0]],[],fixtureDeck().filter(redThree).slice(0,n));
    const end=expire(m,120000,[id(1)]);expect(end.hand!.phase).toBe('complete');expect(end.hand!.pile).toHaveLength(0);assertConservation(end);
  });
  it('accepts one ordinary final card and exposes its companion final red three',()=>{
    const m=boundary([cards('4')[0],cards('5')[0]],[],[cards('6')[0],fixtureDeck().find(redThree)!]);
    const next=expire(m,120000,[id(1)]);expect(next.hand!.turn).toBe(2);expect(next.hand!.players[id(2)].reds).toHaveLength(1);assertConservation(next);
  });
  it('bots use only the private-seat projection and run complete hands through the reducer',()=>{
    for(let seed=1;seed<=8;seed++){
      const deck=fixtureDeck();let x=seed;
      for(let i=deck.length-1;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
      let m=startHand(createMatch({id:id(5),sessionId:id(6),stake:10,realMoney:false,seats},0),id(7),deck,0),turns=0;
      while(m.hand!.phase!=='complete'&&turns<500){
        const h=m.hand!,action=chooseBotAction(project(m,h.active));expect(action).not.toBeNull();
        const c:Command={matchId:m.id,handId:h.id,turn:h.turn,generation:h.generation,revision:m.revision,playerId:h.active,requestId:id(1000+turns),action:action!};
        m=execute(m,c,{kind:'service'},++turns).state;
      }
      expect(m.hand!.phase).toBe('complete');expect(m.completed).toHaveLength(1);assertConservation(m);
    }
  });
  it('rejects regressive and conflicting reconnect snapshots',()=>{
    const m=base(),first={state:project(m,id(1)),serverAt:1,settlement:null,finished:false};
    expect(acceptSnapshot(first,{...first,state:{...first.state,revision:0}})).toBe(first);
    expect(()=>acceptSnapshot(first,{...first,state:{...first.state,stake:999}})).toThrow('snapshot_conflict');
  });
  it('worker recovers without clients and serializes racing stores with revision CAS',async()=>{
    let current:RecordState={state:base(),firstRoundId:id(7),serverAt:120000,activeHumans:[id(1)],botDue:null,finished:false,settlement:null};
    let commits=0;const store:Store={load:async()=>structuredClone(current),finish:async()=>{},commit:async(prior,state)=>{
      if(prior.state.revision!==current.state.revision)throw Error('canasta:conflict');current={...current,state};commits++;return structuredClone(current);}};
    const a=new CanastaAuthority(store),b=new CanastaAuthority(store);
    await Promise.all([a.recover(id(5)),b.recover(id(5))]);expect(commits).toBe(1);expect(current.state.hand!.turn).toBe(2);assertConservation(current.state);
  });
});
