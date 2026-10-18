import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {RoyalTransport} from '@/hooks/useRoyalFlash';
import {arcadeSnapshot,multiplayerSnapshot} from './model';
export async function royalRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 return data as T;
}
export function royalTransport(id:string,userId:string,solo:boolean):RoyalTransport{
 const project=(v:unknown)=>solo?arcadeSnapshot(v,userId):multiplayerSnapshot(v);
 return {
  load:async()=>project(solo?await arcadeRequest({op:'state',game:'royal-flash',runId:id}):await royalRpc('royal_flash_snapshot',{p_dealer_game_id:id})),
  send:async c=>project(solo?await arcadeRequest({op:'action',game:'royal-flash',runId:id,requestId:c.requestId,revision:c.revision,roundId:c.scope,intent:c.intent}):await royalRpc('royal_flash_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:c.intent.type==='place'?[c.intent.index]:null})),
  subscribe:(refresh,status)=>{
   const channel=supabase.channel(`royal:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:solo?'arcade_revisions':'royal_flash_revisions',filter:`${solo?'run_id':'dealer_game_id'}=eq.${id}`},refresh).subscribe(state=>{status(state==='SUBSCRIBED');if(state==='SUBSCRIBED')refresh();});
   return()=>{void supabase.removeChannel(channel);};
  },
 };
}
