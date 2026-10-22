import {CanastaAuthority,type RecordState} from './authority.js';
export type RecoveryRpc=<T>(name:string,args:Record<string,unknown>)=>Promise<T>;
/** A restart can claim an expired lease; only the successful completion records health. */
export async function recoverCanasta(rpc:RecoveryRpc,token:string){
 const claim=await rpc<{accepted:boolean;matches?:string[]}>('canasta_recovery_claim',{p_token:token});
 if(!claim.accepted)throw Error('canasta:recovery_token_denied');
 const authority=new CanastaAuthority({
  load:id=>rpc<RecordState>('canasta_recovery_load',{p_token:token,p_match:id}),
  commit:(prior,state,context)=>rpc<RecordState>('canasta_server_commit',{p_match:prior.state.id,p_revision:prior.state.revision,p_state:state,p_context:context}),
  finish:async id=>{await rpc('canasta_server_finish',{p_match:id});},
 });
 const failures:string[]=[];let processed=0;const started=Date.now();
 for(const id of claim.matches??[]){
  if(Date.now()-started>15000){failures.push('canasta:recovery_budget');break;}
  try{await authority.recover(id);processed++;}catch{failures.push('canasta:recovery_failed');}
 }
 await rpc('canasta_recovery_complete',{p_token:token,p_failure:failures[0]??null});
 return {processed,failures};
}
