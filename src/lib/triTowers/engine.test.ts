import {describe,it,expect} from 'vitest';
import {RULES,children,exposed,adjacent,legalMoves,TRI_TOWERS} from './model';
import {create,reduce,project,deal} from './referenceEngine';
const deck=Array.from({length:52},(_,i)=>i),players=[{id:'p1',userId:'u1',seat:2,name:'One'},{id:'p2',userId:'u2',seat:1,name:'Two'}];
const identity={sessionId:'s',dealerGameId:'d',roundId:'r'};
const fresh=()=>create(identity,players,deck,0);
describe('TriTowers selected rules',()=>{
 it('keeps production admission closed',()=>expect(TRI_TOWERS.publicSelection).toBe(false));
 it('rejects malformed and duplicated decks',()=>{expect(()=>deal(fresh(),deck.slice(1),0)).toThrow('deck');expect(()=>deal(fresh(),Array(52).fill(0),0)).toThrow('deck');});
 it('has the exact 28-card dependency graph',()=>{expect(children(0)).toEqual([3,4]);expect(children(2)).toEqual([7,8]);expect(children(8)).toEqual([16,17]);expect(children(17)).toEqual([26,27]);expect(Array.from({length:28},(_,i)=>i).filter(i=>exposed([],i))).toEqual(Array.from({length:10},(_,i)=>i+18));});
 it('requires both children removed',()=>{expect(exposed([18],9)).toBe(false);expect(exposed([18,19],9)).toBe(true);expect(exposed([18,19,9],9)).toBe(false);});
 it.each([[0,12,true],[0,1,true],[12,11,true],[5,5,false],[0,11,false],[12,13,true]])('rank adjacency %i/%i', (a,b,valid)=>expect(adjacent(a,b)).toBe(valid));
 it('masks all covered cards and every future stock card for every role',()=>{const s=fresh();for(const id of ['p1','p2',null]){const p=project(s,id);expect(p.cards.filter(c=>c!==null)).toHaveLength(10);expect(p).not.toHaveProperty('deck');expect(p.stockRemaining).toBe(23);expect(p.canAct).toBe(id==='p1');}});
 it('uses only the active board for spectators',()=>{const a=project(fresh(),'p1'),b=project(fresh(),'p2');expect(b.cards).toEqual(a.cards);expect(b.waste).toBe(a.waste);expect(b.canAct).toBe(false);});
 it('rejects covered or nonadjacent selection without mutation',()=>{const s=reduce(fresh(),{type:'start'},1,()=>deck),copy=structuredClone(s);expect(()=>reduce(s,{type:'remove',index:0},2,()=>deck)).toThrow();expect(s).toEqual(copy);});
 it('draws once, resets run and never recycles stock',()=>{let s=reduce(fresh(),{type:'start'},0,()=>deck);s.run=4;s=reduce(s,{type:'draw'},1,()=>deck);expect(s.cursor).toBe(30);expect(s.waste).toBe(deck[29]);expect(s.run).toBe(0);});
 it('scores increasing runs with no client timing input to scoring',()=>{let s=reduce(fresh(),{type:'start'},0,()=>deck);s.waste=deck[18]-1;s=reduce(s,{type:'remove',index:18},1,()=>deck);expect(s.score).toBe(1000);s=reduce(s,{type:'remove',index:19},2,()=>deck);expect(s.score).toBe(3000);});
 it('records a peak bonus once',()=>{let s=reduce(fresh(),{type:'start'},0,()=>deck);s.removed=[3,4];s.waste=1;s=reduce(s,{type:'remove',index:0},1,()=>deck);expect(s.score).toBe(6000);expect(()=>reduce(s,{type:'remove',index:0},2,()=>deck)).toThrow();});
 it('ends exhausted stages only when no exposed legal moves remain',()=>{let s=reduce(fresh(),{type:'start'},0,()=>deck);s.cursor=51;s.deck[51]=s.deck[27];s.removed=Array.from({length:27},(_,i)=>i);s=reduce(s,{type:'draw'},1,()=>deck);expect(s.phase).toBe('stage_complete');expect(s.turnIndex).toBe(0);});
 it('keeps both stages and the earned bonus on the same player',()=>{let s=fresh();s.phase='stage_complete';s.stage=1;s=reduce(s,{type:'continue'},1,()=>[...deck].reverse());expect(s.stage).toBe(2);expect(s.turnIndex).toBe(0);expect(s.deck).not.toEqual(deck);
   s.phase='playing';s.score=RULES.bonusThreshold;s.cursor=51;s.removed=Array.from({length:27},(_,i)=>i);s.deck[51]=s.deck[27];s=reduce(s,{type:'draw'},2,()=>deck);expect(s.phase).toBe('stage_complete');s=reduce(s,{type:'continue'},3,()=>deck);expect(s.stage).toBe(3);expect(s.turnIndex).toBe(0);});
 it('finalizes a player once and independently deals the next',()=>{let s=fresh();s.score=1234;s=reduce(s,{type:'give_up'},1,()=>[...deck].reverse());expect(s.scores).toEqual({p1:1234});expect(s.turnIndex).toBe(1);expect(s.deck).toEqual([...deck].reverse());s=reduce(s,{type:'give_up'},2,()=>deck);expect(s.phase).toBe('complete');expect(s.scores).toEqual({p1:1234,p2:0});expect(()=>reduce(s,{type:'give_up'},3,()=>deck)).toThrow('complete');});
 it('server deadlines finish abandoned turns without resetting completed scores',()=>{let s=reduce(fresh(),{type:'tick'},RULES.readyMs,()=>[...deck].reverse());expect(s.turnIndex).toBe(1);s=reduce(s,{type:'tick'},RULES.readyMs*2,()=>deck);expect(s.phase).toBe('complete');expect(s.scores).toEqual({p1:0,p2:0});});
 it('completes a deterministic two-player competition with different deals',()=>{let next=0,s=fresh();const deals:number[][]=[deck];for(let step=0;s.phase!=='complete'&&step<1000;step++){
   const move=legalMoves(s)[0];const intent=s.phase==='ready'?{type:'start' as const}:s.phase==='stage_complete'?{type:'continue' as const}:move===undefined?{type:'draw' as const}:{type:'remove' as const,index:move};
   s=reduce(s,intent,step,()=>{next++;const d=deck.slice(next).concat(deck.slice(0,next));deals.push(d);return d;});
  }expect(s.phase).toBe('complete');expect(Object.keys(s.scores)).toEqual(['p1','p2']);expect(deals.length).toBeGreaterThanOrEqual(4);expect(new Set(deals.map(d=>JSON.stringify(d))).size).toBe(deals.length);
 });
});
