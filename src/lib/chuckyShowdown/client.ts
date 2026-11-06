import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ShowdownCommand,ShowdownSnapshot} from './model';

export interface ShowdownTransport {
  load:()=>Promise<ShowdownSnapshot>;
  send:(command:ShowdownCommand)=>Promise<ShowdownSnapshot>;
  subscribe:(changed:()=>void,status:(connected:boolean)=>void)=>()=>void;
}
export function chuckyShowdownTransport(id:string):ShowdownTransport {
  const base={game:'chucky-showdown',runId:id};
  return {
    load:()=>arcadeRequest({...base,op:'state'}),
    send:command=>arcadeRequest({...base,op:'action',...command}),
    subscribe(changed,status){
      const channel=supabase.channel('chucky-showdown:'+id+':'+crypto.randomUUID())
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+id},changed)
        .subscribe(state=>status(state==='SUBSCRIBED'));
      return ()=>{void supabase.removeChannel(channel);};
    },
  };
}
