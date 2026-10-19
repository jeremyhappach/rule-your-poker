import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {TakeTwoTransport} from '@/hooks/useTakeTwo';
import {arcadeSnapshot,multiplayerSnapshot} from './model';
export async function takeTwoRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 return data as T;
}
export function takeTwoTransport(id:string,userId:string,solo:boolean):TakeTwoTransport{
 const project=(v:unknown)=>solo?arcadeSnapshot(v,userId):multiplayerSnapshot(v);
 return {
  load:async()=>project(solo?await arcadeRequest({op:'state',game:'take-two',runId:id}):await takeTwoRpc('take_two_snapshot',{p_dealer_game_id:id})),
  send:async c=>project(solo?await arcadeRequest({op:'action',game:'take-two',runId:id,requestId:c.requestId,revision:c.revision,roundId:c.scope,intent:c.intent}):await takeTwoRpc('take_two_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:c.intent.type==='pair'?c.intent.items:null})),
  subscribe:(refresh,status)=>{
   const channel=supabase.channel(`takeTwo:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:solo?'arcade_revisions':'take_two_revisions',filter:`${solo?'run_id':'dealer_game_id'}=eq.${id}`},refresh).subscribe(state=>status(state==='SUBSCRIBED'));
   return()=>{void supabase.removeChannel(channel);};
  },
 };
}
