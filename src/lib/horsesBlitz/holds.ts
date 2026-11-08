import type {BlitzSnapshot} from './model';

/** Select the dice in the authoritative offer; never calculate or replace its score. */
export function suggestedBlitzHolds(v:BlitzSnapshot):number[]{
 if(v.roll===0||v.set.size<2||v.set.points<=0)return [];
 const indices=(rank:number)=>v.dice.flatMap((face,index)=>face===rank||face===1?[index]:[]);
 // Retained /1-/3 offers identify only the size. Equal-size legacy melds have
 // identical value; choose a deterministic matching set without changing rules.
 const rank=v.set.rank??[6,5,4,3,2,1].find(face=>indices(face).length===v.set.size);
 if(rank===undefined)return [];
 const selected=indices(rank);
 return selected.length===v.set.size?selected:[];
}

export interface BlitzHoldSelection {handId:string;roll:number;indices:number[]}
export function presentedBlitzHolds(v:BlitzSnapshot,selection:BlitzHoldSelection):number[]{
 return selection.handId===v.handId&&selection.roll===v.roll?selection.indices:suggestedBlitzHolds(v);
}
