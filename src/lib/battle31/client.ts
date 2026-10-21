import {supabase} from '@/integrations/supabase/client';
import type {Battle31Transport} from '@/hooks/useBattle31';
import {multiplayerSnapshot} from './model';
export async function battle31Rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error,status}=await supabase.rpc(name as never,args as never);if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);return data as T;}
export function battle31Transport(id:string):Battle31Transport{return {
 load:async()=>multiplayerSnapshot(await battle31Rpc('battle31_snapshot',{p_dealer_game_id:id})),
 send:async c=>multiplayerSnapshot(await battle31Rpc('battle31_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:c.intent.type==='swap'?c.intent.items:null})),
 subscribe:(refresh,status)=>{const channel=supabase.channel(`battle31:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'battle31_revisions',filter:`dealer_game_id=eq.${id}`},refresh).subscribe(s=>status(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}
};}
