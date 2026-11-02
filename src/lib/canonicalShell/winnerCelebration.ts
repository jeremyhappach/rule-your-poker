import confetti from 'canvas-confetti';
import {presentSound} from '@/lib/audio/presentationSound';

/** Winner-only presentation. Identity receipts never authorize chip movement. */
export function celebrateCanonicalWinner(identity:string,viewerId:string,winnerIds:readonly string[],eligible:boolean,audio=true){
 if(!eligible||!winnerIds.includes(viewerId))return;
 const key=`ptown-winner:${viewerId}:${identity}`;
 if(seen.has(key))return;
 try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch{/* Memory receipt remains. */}
 seen.add(key);
 if(audio)presentSound('winner',identity,document.querySelector('[data-canonical-felt-interaction-layer]'));
 confetti({particleCount:150,spread:70,origin:{y:.6},colors:['#FFD700','#FFA500','#FF6347','#00CED1','#9370DB'],disableForReducedMotion:true});
}
const seen=new Set<string>();
