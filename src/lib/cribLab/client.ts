import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {LabCommand,LabSnapshot} from './model';

export interface LabTransport {
  load:()=>Promise<LabSnapshot>;
  send:(command:LabCommand)=>Promise<LabSnapshot>;
  subscribe:(changed:()=>void,status:(connected:boolean)=>void)=>()=>void;
}
export function cribLabTransport(id:string):LabTransport {
  const base={game:'crib-lab',runId:id};
  return {
    load:()=>arcadeRequest({...base,op:'state'}),
    send:command=>arcadeRequest({...base,op:'action',...command}),
    subscribe(changed,status){
      const channel=supabase.channel('crib-lab:'+id+':'+crypto.randomUUID())
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+id},changed)
        .subscribe(state=>status(state==='SUBSCRIBED'));
      return ()=>{void supabase.removeChannel(channel);};
    },
  };
}
