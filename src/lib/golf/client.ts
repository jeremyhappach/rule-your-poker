import {supabase} from '@/integrations/supabase/client';
import type {GolfTransport} from '@/hooks/useGolf';
import {golfSnapshot} from './model';
export async function golfRpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 return data as T;
}
export function golfTransport(id:string):GolfTransport {
 return {
  load:async()=>golfSnapshot(await golfRpc('golf_snapshot',{p_dealer_game_id:id})),
  send:async c=>golfSnapshot(await golfRpc('golf_action',{p_dealer_game_id:id,p_round_id:c.scope,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:'items' in c.intent?c.intent.items:null})),
  subscribe:(refresh,status)=>{
   const channel=supabase.channel('golf:'+id+':'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'golf_revisions',filter:'dealer_game_id=eq.'+id},refresh).subscribe(s=>status(s==='SUBSCRIBED'));
   return()=>{void supabase.removeChannel(channel);};
  },
 };
}
