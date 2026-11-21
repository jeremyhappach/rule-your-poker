import type {InviteEntry} from './runback';

function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
  return JSON.stringify(value)??'undefined';
}
/** A view over individual entries; never reorder, merge or rewrite the submission. */
export function inviteGroups(lineup:readonly InviteEntry[]){
  const groups=new Map<string,{key:string;entries:InviteEntry[];indices:number[]}>();
  lineup.forEach((entry,index)=>{
    const key=canonical([entry.game,entry.stake,entry.config]);
    let group=groups.get(key);
    if(!group){group={key,entries:[],indices:[]};groups.set(key,group);}
    group.entries.push(entry);group.indices.push(index);
  });
  return [...groups.values()];
}
export function distinctActionMatches(items:readonly {match_id?:string|null;kind:string;actionable:boolean}[]){
  return new Set(items.filter(n=>n.actionable&&n.match_id&&n.kind!=='registration').map(n=>n.match_id)).size;
}
