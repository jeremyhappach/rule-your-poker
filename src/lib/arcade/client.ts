const messages:Record<string,string>={
 'arcade:authentication_required':'Sign in again to restore your run.',
 'arcade:forbidden':'Your account cannot access Arcade.',
 'arcade:not_found':'This run is unavailable for your account.',
 'arcade:stale_action':'The run changed. Review the current board and try again.',
 'arcade:concurrent_action':'The run changed. Review the current board and try again.',
 'arcade:run_ended':'This run has ended.',
 'arcade:round_intro':'The round is starting.',
 'arcade:result_presentation':'The round result is still being shown.',
 'arcade:column_locked':'Choose an available column.',
 'arcade:pass_used':'Your pass has already been used this round.',
 'arcade:recovery_unavailable':'New runs are temporarily unavailable. Please try again soon.',
 'arcade:maintenance':'New runs are temporarily closed for maintenance.',
};
export async function arcadeRequest<T>(body:Record<string,unknown>):Promise<T>{
 const {supabase}=await import('@/integrations/supabase/client');
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw Error('Sign in to play Arcade.');
 for(let attempt=0;attempt<2;attempt++){
  let response:Response;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try {response=await fetch('/api/arcade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body),signal:controller.signal});}
  catch{if(attempt===0)continue;throw Error('Connection lost. Reconnect to restore your run.');}
  finally{clearTimeout(timeout);}
  const value=await response.json();
  if(!response.ok)throw Error(messages[value.error]??'Arcade could not process that request. Please try again.');
  return value as T;
 }
 throw Error('Connection lost. Reconnect to restore your run.');
}

