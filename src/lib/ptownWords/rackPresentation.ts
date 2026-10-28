/** Display order only: no game randomness, draws, or authoritative state. */
export function shuffleRack(ids:number[],random:()=>number=Math.random){
 const next=[...ids];for(let i=next.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}
 if(next.length>1&&next.every((id,i)=>id===ids[i]))next.push(next.shift()!);
 return next;
}
export function isInvalidWord(error:string){return /^ptown_words:invalid_word:[A-Z]+$/.test(error);}
