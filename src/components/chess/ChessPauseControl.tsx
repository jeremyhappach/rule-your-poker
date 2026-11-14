import {Pause,Play,X} from 'lucide-react';
import type {ChessSnapshot} from '@/lib/chess/client';
import type {ChessIntent} from '@/lib/chess/rules';
export function ChessPauseControl({view:v,pending,connected,onPause,onIntent}:{view:ChessSnapshot;pending:boolean;connected:boolean;onPause?:()=>unknown;onIntent:(i:ChessIntent)=>Promise<boolean>}){
 if(v.mode!=='live'||!v.hostUserId||v.pauseVersion===undefined||v.phase!=='playing'||v.finished)return null;
 const host=v.players.find(p=>p.id===v.viewerId)?.userId===v.hostUserId,cancel=!host&&!v.paused&&v.pauseRequest?.playerId===v.viewerId;
 const label=cancel?'Cancel pause request':v.paused?'Resume game':host?'Pause game':'Request pause';
 return <button className="chess-pause" aria-label={label} title={label} disabled={pending||!connected||(host&&!onPause)||(v.paused&&!host)||(!host&&!!v.pauseRequest&&!cancel)} onClick={()=>host?onPause?.():void onIntent(cancel?{type:'cancel_pause_request',requestId:v.pauseRequest!.id}:{type:'request_pause'})}>{cancel?<X size={18}/>:v.paused?<Play size={18}/>:<Pause size={18}/>}</button>;
}
