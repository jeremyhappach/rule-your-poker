import {describe,it,expect} from 'vitest';
import {maximumHandWitness,maximumHandCountBound} from './maximumHand.fixture';
import {rulesFor,VERSION} from './rules';

describe('Classic two-player maximum hand',()=>{
  it('reaches 71 through shared stock, discard and frozen-opening predicates',()=>{
    const w=maximumHandWitness();
    expect(w.trace).toHaveLength(31);
    expect(w.trace.at(-1)).toEqual({turn:31,a:30,b:30,stock:0,pile:44});
    expect(w.hand).toHaveLength(71);
    expect(w.afterDiscard).toHaveLength(70);
    expect(w.melds[0].cards).toHaveLength(3);
    expect(w.opponent).toHaveLength(30);
    expect(w.reds).toHaveLength(4);
    expect(new Set([...w.hand,...w.melds[0].cards,...w.opponent,...w.reds].map(c=>c.id)).size).toBe(108);
  });
  it('rejects the same pickup without its natural pair or enough opening count',()=>{
    const w=maximumHandWitness(),r=rulesFor(VERSION);
    const input={...w.beforePickup,opened:false,score:0,existing:[],qualifierIds:w.melds[0].cards.slice(0,2).map(c=>c.id),opening:w.melds};
    expect(r.pickupError({...input,qualifierIds:input.qualifierIds.slice(0,1)})).toMatch(/two matching/);
    expect(r.pickupError({...input,score:3000})).toMatch(/120/);
  });
  it('bounds all acquisition phases, including remaining stock and partial final draws',()=>{
    expect(maximumHandCountBound()).toEqual({pickup:71,stockAfterPickup:70,stockWithoutPickup:53,completedTurn:70});
  });
});
