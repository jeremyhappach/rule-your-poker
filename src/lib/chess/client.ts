import {supabase} from '@/integrations/supabase/client';
import type {ChessIntent,ChessState} from './rules';
export type ChessSnapshot=ChessState&{id:string;revision:number;serverAt:number;viewerId:string;canAct:boolean;paused:boolean;pausedAt:number|null;finished:boolean;settled:boolean;settlement:Record<string,number>|null;financial:any};
export interface Command {requestId:string;revision:number;intent:ChessIntent}
export interface ChessTransport {load:()=>Promise<ChessSnapshot>;send:(c:Command)=>Promise<ChessSnapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
export function acceptChessSnapshot(old:ChessSnapshot|null,next:ChessSnapshot,id:string){
 if(next.identity.dealerGameId!==id||!Number.isSafeInteger(next.revision)||next.players.length!==2)throw Error('chess:identity');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){const stable=(v:ChessSnapshot)=>JSON.stringify([v.identity,v.rules,v.players,v.backgroundId,v.fen,v.moves,v.captured,v.banks,v.phase,v.deadline,v.clockDuration,v.opened,v.paused,v.finished,v.settlement]);if(stable(old)!==stable(next))throw Error('chess:conflicting_snapshot');}
 return next;
}
export function chessTransport(id:string,userId:string,mode:'live'|'async'):ChessTransport{
 const call=async(command?:Command)=>{const {data}=await supabase.auth.getSession();const token=data.session?.access_token;if(!token)throw Error('chess:authentication_required');const response=await fetch('/api/chess',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({op:command?'action':'state',matchId:id,mode,...command})});const value=await response.json();if(!response.ok)throw Error(response.status>=500?'Connection uncertain. Reconnect to retry.':value.error);return value as ChessSnapshot;};
 return {load:()=>call(),send:call,subscribe:(refresh,status)=>{const channel=supabase.channel('chess:'+id+':'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:mode==='live'?'chess_revisions':'delayed_match_updates',filter:mode==='live'?'dealer_game_id=eq.'+id:'user_id=eq.'+userId},refresh).subscribe(s=>status(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}};
}
