import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ElevenTransport} from '@/hooks/useElevenUp';
import {arcadeSnapshot,multiplayerSnapshot} from './model';
export async function elevenRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 return data as T;
}
export function elevenTransport(id:string,userId:string,solo:boolean):ElevenTransport{
 const project=(v:unknown)=>solo?arcadeSnapshot(v,userId):multiplayerSnapshot(v);
 return {
  load:async()=>project(solo?await arcadeRequest({op:'state',game:'eleven-up',runId:id}):await elevenRpc('eleven_up_snapshot',{p_dealer_game_id:id})),
  send:async c=>project(solo?await arcadeRequest({op:'action',game:'eleven-up',runId:id,requestId:c.requestId,revision:c.revision,roundId:c.scope,intent:c.intent}):c.intent.type==='reclaim'?await elevenRpc('eleven_up_reclaim',{p_dealer_game_id:id,p_revision:c.revision}):await elevenRpc('eleven_up_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:c.intent.type==='group'?c.intent.items:null})),
  subscribe:(refresh,status)=>{
   const channel=supabase.channel(`eleven:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:solo?'arcade_revisions':'eleven_up_revisions',filter:`${solo?'run_id':'dealer_game_id'}=eq.${id}`},refresh).subscribe(state=>{status(state==='SUBSCRIBED');if(state==='SUBSCRIBED')refresh();});
   return()=>{void supabase.removeChannel(channel);};
  },
 };
}
