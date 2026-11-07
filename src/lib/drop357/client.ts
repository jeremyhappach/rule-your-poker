import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {DropCommand,DropSnapshot} from './model';
export interface DropTransport {load:()=>Promise<DropSnapshot>;send:(c:DropCommand)=>Promise<DropSnapshot>;subscribe:(changed:()=>void,status:(ready:boolean)=>void)=>()=>void}
export function dropTransport(id:string):DropTransport {
 const base={game:'357-drop',runId:id};
 return {load:()=>arcadeRequest({...base,op:'state'}),send:c=>arcadeRequest({...base,op:'action',...c}),
  subscribe(changed,status){const channel=supabase.channel('357-drop:'+id+':'+crypto.randomUUID())
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+id},changed)
   .subscribe(s=>status(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}};
}
