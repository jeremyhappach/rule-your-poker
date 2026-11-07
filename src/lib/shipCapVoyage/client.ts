import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {VoyageCommand,VoyageSnapshot} from './model';
export interface VoyageTransport {load:()=>Promise<VoyageSnapshot>;send:(c:VoyageCommand)=>Promise<VoyageSnapshot>;subscribe:(changed:()=>void,status:(ready:boolean)=>void)=>()=>void}
export function voyageTransport(id:string):VoyageTransport {
 const base={game:'ship-cap-voyage',runId:id};
 return {load:()=>arcadeRequest({...base,op:'state'}),send:c=>arcadeRequest({...base,op:'action',...c}),
  subscribe(changed,status){const channel=supabase.channel('ship-cap-voyage:'+id+':'+crypto.randomUUID())
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+id},changed)
   .subscribe(s=>status(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}};
}
