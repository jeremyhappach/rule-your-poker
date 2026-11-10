import {randomInt} from 'node:crypto';
export function shuffledShoe(){
 const shoe=[];
 for(let deck=0;deck<6;deck++)for(const suit of ['♠','♥','♦','♣'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])shoe.push({rank,suit});
 for(let i=shoe.length-1;i>0;i--){const j=randomInt(i+1);[shoe[i],shoe[j]]=[shoe[j],shoe[i]];}
 return shoe;
}
