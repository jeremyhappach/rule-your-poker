import {randomInt} from 'node:crypto';
/** Same cryptographic Fisher-Yates deal for every Mega mode. Never import in UI. */
export function megaDecks(holes:number){
 return Array.from({length:holes},()=>{
  const deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
 });
}
