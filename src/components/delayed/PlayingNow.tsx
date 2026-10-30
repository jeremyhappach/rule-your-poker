import {playingTopic,usePlayingPresence} from '@/lib/delayed/playingPresence';
export function PlayingNow({matchId,childId,actor,deadline,enabled,refresh}:{matchId:string;childId:string;actor:string|null;deadline:number;enabled:boolean;refresh:()=>void}){
 const playing=usePlayingPresence(enabled&&actor?playingTopic(matchId,childId,actor,deadline):null,false,refresh);
 return playing?<span className="delayed-playing" role="status">Playing now</span>:null;
}
