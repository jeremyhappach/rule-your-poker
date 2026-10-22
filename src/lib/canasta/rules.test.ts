import {describe,it,expect} from 'vitest';
import {fixtureDeck,standard,redThree,openingMinimum,openingReport,pileStatus,pickupError,mechanicalFinish,meldError,rulesFor,VERSION,initialPile,stockDraw,handScore,turnPlan} from './rules';
import type {Rank} from '../cardUtils';
const deck=fixtureDeck();
const rank=(r:Rank)=>deck.filter(c=>standard(c)?.rank===r);
const joker=deck.find(c=>'kind' in c.face)!;
describe('canasta-classic-two/1 checkpoint boundaries',()=>{
  it('has exactly 108 distinct physical cards and two copies of each natural face',()=>{
    expect(deck).toHaveLength(108);expect(new Set(deck.map(c=>c.id)).size).toBe(108);
    expect(deck.filter(c=>standard(c)?.rank==='Q'&&standard(c)?.suit==='♠')).toHaveLength(2);
    expect(deck.filter(redThree)).toHaveLength(4);
  });
  it('dispatches the frozen version and rejects unknown versions',()=>{
    expect(rulesFor(VERSION).contract.turnMs).toBe(120000);
    expect(()=>rulesFor('canasta-classic-two/2')).toThrow();
  });
  it.each([[-1,15],[0,50],[1499,50],[1500,90],[2999,90],[3000,120]])('signed opening %i needs %i',(s,n)=>expect(openingMinimum(s)).toBe(n));
  it('black threes block only while on top, unlike buried wilds and initial red threes',()=>{
    const black=rank('3').find(c=>!redThree(c))!,red=rank('3').find(redThree)!;
    expect(pileStatus([black],true)).toMatchObject({blocked:true,globalFreeze:false});
    expect(pileStatus([black,rank('7')[0]],true)).toMatchObject({blocked:false,globalFreeze:false});
    expect(pileStatus([joker,rank('7')[0]],true).globalFreeze).toBe(true);
    expect(pileStatus([red,rank('7')[0]],true).globalFreeze).toBe(true);
    expect(pileStatus([rank('7')[0]],false).personalFreeze).toBe(true);
  });
  it('accepts two matching physical copies but never duplicates one ID',()=>{
    const q=rank('Q'),hand=[q[0],q[4],rank('A')[0]];
    const input={hand,pile:[joker,q[7]],opened:true,score:0,existing:[],opening:[],qualifierIds:[q[0].id,q[4].id]};
    expect(pickupError(input)).toBeNull();
    expect(pickupError({...input,qualifierIds:[q[0].id,q[0].id]})).toMatch(/distinct/);
  });
  it('does not let a wild or an existing meld bypass a freeze',()=>{
    const q=rank('Q'),input={hand:[q[0],joker],pile:[rank('2')[0],q[7]],opened:true,score:0,existing:[{rank:'Q' as const,cards:q.slice(1,4)}],opening:[],qualifierIds:[]};
    expect(pickupError(input)).toMatch(/two matching/);
    expect(pickupError({...input,qualifierIds:[q[0].id,joker.id]})).toMatch(/two matching/);
    expect(pickupError({...input,pile:[q[7]]})).toBeNull();
  });
  it('counts top plus hand only; 70 is insufficient at 90',()=>{
    const n=rank('9'),q=rank('Q'),two=rank('2')[0];
    const opening=[{rank:'9' as const,cards:n.slice(0,3)},{rank:'Q' as const,cards:[q[0],q[1],two]}];
    const input={hand:[n[0],n[1],q[0],q[1],two],pile:[q[2],n[2]],opened:false,score:1500,existing:[],opening,qualifierIds:[n[0].id,n[1].id]};
    expect(openingReport(opening,1500).count).toBe(70);
    expect(pickupError(input)).toMatch(/90/);
    expect(pickupError({...input,score:0})).toBeNull();
    expect(pickupError({...input,opening:[opening[0],{...opening[1],cards:[...opening[1].cards,q[2]]}]})).toMatch(/Buried/);
  });
  it('permits two naturals and three wilds, rejecting a fourth wild',()=>{
    const m={rank:'Q' as const,cards:[...rank('Q').slice(0,2),...rank('2').slice(0,3)]};
    expect(meldError(m)).toBeNull();expect(meldError({...m,cards:[...m.cards,joker]})).toMatch(/three wild/);
  });
  it('does not reject a qualified pickup because the timeout planner must pause',()=>{
    const q=rank('Q'),red=rank('3').find(redThree)!,last=rank('K')[0];
    const hand=[q[0],q[1],last],pile=[red,q[2]];
    expect(pickupError({hand,pile,opened:true,score:0,existing:[],opening:[],qualifierIds:[q[0].id,q[1].id]})).toBeNull();
    expect(mechanicalFinish([last],[{rank:'Q',cards:q.slice(0,3)}])).toEqual({kind:'pause-recovery'});
  });
  it('has a narrow forced terminal meld fallback, not general bot planning',()=>{
    const q=rank('Q'),k=rank('K');
    expect(mechanicalFinish([k[6]],[{rank:'Q',cards:q.slice(0,7)},{rank:'K',cards:k.slice(0,6)}]))
      .toEqual({kind:'meld-out',cardId:k[6].id,rank:'K'});
    expect(mechanicalFinish([k[6]],[{rank:'Q',cards:q.slice(0,7)},{rank:'K',cards:k.slice(0,5)}])).toEqual({kind:'pause-recovery'});
  });
  it('mechanically discards a deuce instead of strategically making sevens',()=>{
    const two=rank('2')[0];
    expect(mechanicalFinish([two,...rank('7').slice(0,3)],[])).toEqual({kind:'discard',cardId:two.id});
  });
  it('initial wild/red processing stops at a black three',()=>{
    const red=rank('3').find(redThree)!,black=rank('3').find(c=>!redThree(c))!,king=rank('K')[0];
    expect(initialPile([joker,red,black,king])).toEqual({pile:[joker,red,black],stock:[king]});
  });
  it('stock-tail draws conserve identities and distinguish immediate termination',()=>{
    const reds=rank('3').filter(redThree),king=rank('K')[0];
    for(const input of [[king],[king,reds[0]],[reds[0],king],[reds[0]],[reds[0],reds[1]]]){
      const result=stockDraw(input);
      expect(new Set([...result.stock,...result.cards,...result.reds].map(c=>c.id))).toEqual(new Set(input.map(c=>c.id)));
      expect(result.endsImmediately).toBe(!input.includes(king));
    }
  });
  it('keeps scores signed, including all red threes without an opening',()=>{
    expect(handScore([],rank('A').slice(0,2),4,'none')).toBe(-840);
    expect(handScore([{rank:'Q',cards:rank('Q').slice(0,7)}],[],0,'ordinary')).toBe(670);
  });
  it('rejects emptying without two canastas and allows legal final discard',()=>{
    const k=rank('K')[0],melds=[{rank:'Q' as const,cards:rank('Q').slice(0,7)},{rank:'7' as const,cards:rank('7').slice(0,7)}];
    expect(turnPlan({hand:[k],existing:[],drafts:[],discardId:k.id,opened:true,score:0}).error).toMatch(/two canastas/);
    expect(turnPlan({hand:[k],existing:melds,drafts:[],discardId:k.id,opened:true,score:0})).toMatchObject({error:null,out:true,remaining:[]});
  });
  it('waives a concealed opening count only after a stock draw',()=>{
    const drafts=[{rank:'4' as const,cards:rank('4').slice(0,7)},{rank:'5' as const,cards:rank('5').slice(0,7)}];
    const input={hand:drafts.flatMap(m=>m.cards),existing:[],drafts,discardId:null,opened:false,score:3500};
    expect(turnPlan({...input,drawSource:'stock'}).error).toBeNull();
    expect(turnPlan({...input,drawSource:'pile'}).error).toMatch(/120/);
  });
});
