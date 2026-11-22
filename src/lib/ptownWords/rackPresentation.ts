/** Display order only: no game randomness, draws, or authoritative state. */
export function shuffleRack(ids:number[],random:()=>number=Math.random){
 const next=[...ids];for(let i=next.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}
 if(next.length>1&&next.every((id,i)=>id===ids[i]))next.push(next.shift()!);
 return next;
}
export function invalidWords(error:string){
 const match=/^ptown_words:invalid_word:([A-Z]+(?:,[A-Z]+)*)$/.exec(error);
 return match?[...new Set(match[1].split(','))]:[];
}
export function isInvalidWord(error:string){return invalidWords(error).length>0;}
export function invalidWordMessage(error:string){
 const words=invalidWords(error);
 return words.length?`Invalid ${words.length===1?'word':'words'}: ${words.join(', ')}`:'';
}
/** Stable tile IDs, including duplicate letters/blanks; display order only. */
export function reorderRack(ids:number[],tileId:number,index:number){
 if(!ids.includes(tileId))return ids;
 const next=ids.filter(id=>id!==tileId);
 next.splice(Math.max(0,Math.min(next.length,index)),0,tileId);
 return next;
}
