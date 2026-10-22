import {createClient} from '@supabase/supabase-js';
import type {Store,RecordState} from './authority';

/** Private RPC adapter. Client roles cannot submit reducer state. */
export function createStore(url:string,key:string):Store{
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  async function rpc(name:string,args:Record<string,unknown>):Promise<RecordState>{
    const {data,error,status}=await db.rpc(name,args);
    if(error)throw Error(!error.code||status>=500?'canasta:uncertain':error.message.startsWith('canasta:')?error.message:'canasta:database_rejected');
    return data as RecordState;
  }
  return {load:(id,userId)=>rpc('canasta_server_load',{p_match:id,p_user:userId??null}),
    commit:(row,state,context)=>rpc('canasta_server_commit',{p_match:row.state.id,p_revision:row.state.revision,p_state:state,p_context:context}),
    finish:async id=>{await rpc('canasta_server_finish',{p_match:id});}};
}
