import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {BlitzCommand,BlitzSnapshot} from './model';
export interface BlitzTransport {load:()=>Promise<BlitzSnapshot>;send:(c:BlitzCommand)=>Promise<BlitzSnapshot>;subscribe:(changed:()=>void,status:(ready:boolean)=>void)=>()=>void}
export function blitzTransport(id:string):BlitzTransport {
 const base={game:'horses-blitz',runId:id};
 return {load:()=>arcadeRequest({...base,op:'state'}),send:c=>arcadeRequest({...base,op:'action',...c}),
  subscribe(changed,status){const channel=supabase.channel('horses-blitz:'+id+':'+crypto.randomUUID())
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+id},changed)
   .subscribe(s=>status(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}};
}
