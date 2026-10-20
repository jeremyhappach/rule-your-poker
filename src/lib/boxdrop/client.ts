import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {BoxdropTransport} from '@/hooks/useBoxdrop';
import {arcadeSnapshot,multiplayerSnapshot} from './model';
export async function boxdropRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 return data as T;
}
export function boxdropTransport(id:string,userId:string,solo:boolean):BoxdropTransport{
 const project=(v:unknown)=>solo?arcadeSnapshot(v,userId):multiplayerSnapshot(v);
 return {
  load:async()=>project(solo?await arcadeRequest({op:'state',game:'boxdrop',runId:id}):await boxdropRpc('boxdrop_snapshot',{p_dealer_game_id:id})),
  send:async c=>project(solo?await arcadeRequest({op:'action',game:'boxdrop',runId:id,requestId:c.requestId,revision:c.revision,roundId:c.scope,intent:c.intent}):await boxdropRpc('boxdrop_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:(c.intent.type==='place'||c.intent.type==='recycle')?c.intent.items:null})),
  subscribe:(refresh,status)=>{
   const channel=supabase.channel(`boxdrop:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:solo?'arcade_revisions':'boxdrop_revisions',filter:`${solo?'run_id':'dealer_game_id'}=eq.${id}`},refresh).subscribe(state=>status(state==='SUBSCRIBED'));
   return()=>{void supabase.removeChannel(channel);};
  },
 };
}
