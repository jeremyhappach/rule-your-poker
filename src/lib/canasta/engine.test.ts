import {describe,it,expect} from 'vitest';
import {createMatch,startHand,execute,expire,resume,pause,project,assertConservation,settlementIntent,type Match,type Action,type Command} from './engine';
import {fixtureDeck,redThree,wild,standard,CONTRACT} from './rules';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),B=id(2),UA=id(3),UB=id(4);
function fresh(){return createMatch({id:id(5),sessionId:id(6),stake:10,realMoney:false,seats:[
  {id:A,userId:UA,kind:'human',seat:1},{id:B,userId:UB,kind:'human',seat:5}]},0);}
function cmd(m:Match,action:Action,n=100):Command{return {requestId:id(n),matchId:m.id,handId:m.hand!.id,turn:m.hand!.turn,
  generation:m.hand!.generation,revision:m.revision,playerId:m.hand!.active,action};}
function step(m:Match,action:Action,n:number){return execute(m,cmd(m,action,n),{kind:'service'},n).state;}
/** Complete 108-card deal witness, including red-three exposure/replacement and initial upcards. */
export function maximumThroughReducer(){
  const deck=fixtureDeck(),reds=deck.filter(redThree),wilds=deck.filter(wild);
  let pool=deck.filter(c=>!redThree(c)&&!wild(c));const aces=pool.filter(c=>standard(c)?.rank==='A').slice(0,4);
  pool=pool.filter(c=>!aces.includes(c));const a=[...aces.slice(0,2),...pool.splice(0,13)],b=[aces[2],...pool.splice(0,14)];
  const dealtA=[...a.slice(0,11),...reds],ordered=b.flatMap((c,i)=>[c,dealtA[i]]);
  ordered.push(...a.slice(11),...wilds,aces[3],...pool);
  let m=startHand(fresh(),id(7),ordered,0),n=10;
  const history:Match[]=[m];
  for(let turn=1;turn<=31;turn++){
    m=step(m,{type:'draw'},n++);const p=m.hand!.players[m.hand!.active];
    const discard=turn===31?aces[2]:p.cards.find(c=>m.hand!.active===B?c.id!==aces[2].id:!aces.slice(0,2).some(x=>x.id===c.id))!;
    m=step(m,{type:'finish',groups:[],discard:discard.id},n++);assertConservation(m);history.push(m);
  }
  expect(m.hand!.stock).toHaveLength(0);expect(m.hand!.active).toBe(A);
  const top=m.hand!.pile.at(-1)!;
  m=step(m,{type:'pickup',qualifiers:aces.slice(0,2).map(c=>c.id),opening:[{rank:'A',ids:[...aces.slice(0,2).map(c=>c.id),top.id]}]},n++);
  const afterPickup=m;
  m=step(m,{type:'finish',groups:[],discard:m.hand!.players[A].cards[0].id},n++);
  return {afterPickup,afterDiscard:m,history};
}
describe('complete Canasta reducer',()=>{
  it('reaches 71 through deal, 31 alternating draws/discards and committed frozen pickup; then 70',()=>{
    const w=maximumThroughReducer();expect(w.afterPickup.hand!.players[A].cards).toHaveLength(71);
    expect(w.afterDiscard.hand!.players[A].cards).toHaveLength(70);expect(w.afterPickup.hand!.pile).toHaveLength(0);
    expect(w.afterPickup.hand!.players[A].reds).toHaveLength(4);expect(w.afterPickup.hand!.players[A].melds[0].cards).toHaveLength(3);
    expect(w.afterPickup.hand!.deadline).toBe(w.history.at(-1)!.hand!.deadline);assertConservation(w.afterDiscard);
  });
  it('never projects stock, receipts, or opponent physical IDs, including completed hands',()=>{
    const m=startHand(fresh(),id(7),fixtureDeck(),0),p=project(m,A),wire=JSON.stringify(p);
    expect(p.hand!.players[B].cards).toBeNull();expect(wire).not.toContain(m.hand!.stock[0].id);
    expect(wire).not.toContain(m.hand!.players[B].cards[0].id);expect(wire).not.toContain('receipts');
  });
  it('preserves a committed stock draw, rejects at deadline, returns exact duplicate late',()=>{
    const m=startHand(fresh(),id(7),fixtureDeck(),0),c=cmd(m,{type:'draw'});
    expect(()=>execute(m,c,{kind:'human',userId:UA},10)).toThrow('unauthorized');
    const drawn=execute(m,c,{kind:'human',userId:UB},CONTRACT.turnMs-1).state;
    expect(execute(drawn,c,{kind:'human',userId:UB},CONTRACT.turnMs+1).duplicate).toBe(true);
    expect(()=>execute(m,c,{kind:'human',userId:UB},CONTRACT.turnMs)).toThrow('deadline');
    const expired=expire(drawn,CONTRACT.turnMs,[A]);expect(expired.hand!.stock.length).toBe(drawn.hand!.stock.length);
    expect(expired.hand!.turn).toBe(2);expect(expired.automatic).toEqual([B]);assertConservation(expired);
  });
  it('pauses human/bot and real-money expiry, resumes once with a new generation',()=>{
    let m=startHand(fresh(),id(7),fixtureDeck(),0);m.seats[0]={...m.seats[0],kind:'bot',userId:null};
    const paused=expire(m,CONTRACT.turnMs,[]);expect(paused.pause?.reason).toBe('inactivity');
    expect(paused.hand!.stock).toEqual(m.hand!.stock);
    const resumed=resume(paused,CONTRACT.turnMs+500,paused.pause!.episode);
    expect(resumed.hand!.deadline).toBe(CONTRACT.turnMs*2+500);
    expect(()=>resume(resumed,CONTRACT.turnMs+600,1)).toThrow('pause_episode');
    m=startHand(fresh(),id(7),fixtureDeck(),0);m.realMoney=true;
    expect(expire(m,CONTRACT.turnMs,[A]).pause?.reason).toBe('inactivity');
  });
  it('retains normal pause remaining budget and fences old commands',()=>{
    const m=startHand(fresh(),id(7),fixtureDeck(),0),c=cmd(m,{type:'draw'}),p=pause(m,20000,'manual');
    const resumed=resume(p,90000,p.pause!.episode);expect(resumed.hand!.deadline).toBe(190000);
    expect(()=>execute(resumed,c,{kind:'service'},90001)).toThrow('stale_command');
  });
  it('preserves pickup on timeout and ends the following exhausted hand exactly once',()=>{
    const {afterPickup:m}=maximumThroughReducer(),deadline=m.hand!.deadline;
    const done=expire(m,deadline,[B]);expect(done.hand!.players[A].cards).toHaveLength(70);
    expect(done.hand!.players[A].melds).toEqual(m.hand!.players[A].melds);
    const c=cmd(done,{type:'end-exhausted'},900),ended=execute(done,c,{kind:'service'},deadline+1).state;
    expect(ended.completed).toHaveLength(1);expect(ended.hand!.result?.out).toBeNull();
    expect(execute(ended,c,{kind:'service'},deadline+2).state.completed).toHaveLength(1);
    expect(settlementIntent(ended)).toBeNull();expect(startHand(ended,id(8),fixtureDeck(),deadline+3).hand!.dealer).toBe(1);
  });
  it('rejects duplicate IDs, changed physical faces, and mismatched receipt reuse',()=>{
    const deck=fixtureDeck();deck[1]=deck[0];expect(()=>startHand(fresh(),id(7),deck,0)).toThrow('deck');
    const m=startHand(fresh(),id(7),fixtureDeck(),0),c=cmd(m,{type:'draw'}),drawn=execute(m,c,{kind:'service'},1).state;
    expect(()=>execute(drawn,{...c,action:{type:'end-exhausted'}},{kind:'service'},2)).toThrow('receipt_conflict');
  });
});
