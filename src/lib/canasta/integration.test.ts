import {describe,it,expect} from 'vitest';
import {createMatch,startHand,project,execute,assertConservation,type Command} from './engine';
import {fixtureDeck} from './rules';
import {chooseBotAction} from './bot';
import {recoverCanasta} from '../../../server/canasta/recovery';
import {isCanonicalShellFamily,isCanonicalSeatConsumer} from '../canonicalShell/shellRouting';
import {resolveExactRunBackConfig} from '../dealerGameSetup/runBackConfig';
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
describe('Canasta integrated authority',()=>{
 it('completes autonomous 5,000-point matches with signed totals and conserved physical cards',()=>{
  for(let seed=1;seed<=3;seed++){
   let m=createMatch({id:id(1),sessionId:id(2),stake:10,realMoney:false,seats:[{id:id(3),userId:id(5),kind:'human',seat:1},{id:id(4),userId:null,kind:'bot',seat:5}]},0);
   let moves=0,x=seed;
   while(!m.winner&&m.completed.length<100){
    const deck=fixtureDeck();for(let i=deck.length-1;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
    m=startHand(m,id(100+m.completed.length),deck,moves);
    while(m.hand!.phase!=='complete'&&moves<20000){
     const h=m.hand!,action=chooseBotAction(project(m,h.active));expect(action).not.toBeNull();
     const c:Command={matchId:m.id,handId:h.id,turn:h.turn,generation:h.generation,revision:m.revision,playerId:h.active,requestId:id(1000+moves),action:action!};
     m=execute(m,c,{kind:'service'},++moves).state;assertConservation(m);
    }
   }
   expect(m.winner).not.toBeNull();expect(m.totals[m.winner!]).toBeGreaterThanOrEqual(5000);expect(m.stake).toBe(10);
  }
 },20000);
 it('rejects reused recovery leases and acknowledges failures without marking health successful',async()=>{
  const calls:string[]=[];
  const denied=async<T>(name:string)=>{calls.push(name);return {accepted:false} as T;};
  await expect(recoverCanasta(denied,id(8))).rejects.toThrow('token_denied');expect(calls).toEqual(['canasta_recovery_claim']);
  let acknowledgement:unknown;
  const rpc=async<T>(name:string,args:Record<string,unknown>)=>{
   if(name==='canasta_recovery_claim')return {accepted:true,matches:[id(1)]} as T;
   if(name==='canasta_recovery_load')throw Error('worker restart');
   acknowledgement=args;return null as T;
  };
  expect((await recoverCanasta(rpc,id(9))).failures).toEqual(['canasta:recovery_failed']);
  expect(acknowledgement).toEqual({p_token:id(9),p_failure:'canasta:recovery_failed'});
 });
 it('uses canonical seating and preserves only the accepted stake for fresh Run Back consent',()=>{
  expect(isCanonicalShellFamily('canasta')).toBe(true);expect(isCanonicalSeatConsumer('canasta')).toBe(true);
  expect(resolveExactRunBackConfig('canasta',{ante_amount:10,roster:['old-seat'],rules:{version:'canasta-classic-two/1'}})).toEqual({ante_amount:10});
 });
});
