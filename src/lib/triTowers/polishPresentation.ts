import type {Rules} from './model';

/** Lookup of already-awarded, frozen bonuses; never modifies gameplay scores. */
export function towerAwards(removed:readonly number[],rules:Rules){
 return removed.filter(index=>index<3).map((tower,order)=>({tower,amount:rules.peakBonuses[order]}));
}
export function dotClock(remaining:number,full:number){
 const fraction=Math.max(0,Math.min(1,remaining/full));
 return {lit:Math.ceil(fraction*24),tone:fraction>.1?'green':fraction>.05?'yellow':'red'} as const;
}
