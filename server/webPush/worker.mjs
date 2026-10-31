/** Scheduler-independent durable worker. Caller must supply an authenticated service RPC and transport. */
export async function deliverOne(rpc,send){
 const claim=await rpc('async_push_claim',{});if(!claim)return false;
 const args={p_event:claim.eventId,p_subscription:claim.subscriptionId,p_lease:claim.lease};
 let result='retry';
 try{
  const job=await rpc('async_push_authorize',args);
  if(!job||!Number.isFinite(job.payload?.expiresAt)||job.payload.expiresAt<=Date.now())result='skipped';
  else{
   const response=await send(job);
   result=response.skipped?'skipped':response.status>=200&&response.status<300?'sent':[404,410].includes(response.status)?'gone':response.status===429||response.status>=500?'retry':'failed';
  }
 }catch{result='retry';}
 // Lost receipt response is harmless; lease + state CAS makes repeated receipts inert.
 await rpc('async_push_receipt',{...args,p_result:result});return true;
}
