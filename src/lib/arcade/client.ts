import {UncertainTriAction,RejectedTriAction} from '@/lib/triTowers/intentBuffer';
import {triTiming} from '@/lib/triTowers/diagnostics';
const messages:Record<string,string>={
 'arcade:refresh_required':'TriTowers updated. Refresh to continue.',
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
 const timed=body.game==='tri-towers',id=String(body.requestId??'state'),started=performance.now();if(timed)triTiming('request-start',id);
 const {supabase}=await import('@/integrations/supabase/client');
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw Error('Sign in to play Arcade.');
 let lostResponse=false;if(timed)triTiming('session-ready',id,performance.now()-started);
 for(let attempt=0;attempt<2;attempt++){
  let response:Response;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try {if(timed)triTiming('fetch-dispatch',id,performance.now()-started,String(attempt));response=await fetch('/api/arcade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({...body,presentationVersion:3}),signal:controller.signal});}
  catch{lostResponse=true;if(attempt===0)continue;throw timed?new UncertainTriAction('Connection lost. Reconnect to restore your game.'):Error('Connection lost. Reconnect to restore your run.');}
  finally{clearTimeout(timeout);}
  if(timed)triTiming('response-headers',id,performance.now()-started,response.headers.get('Server-Timing')??undefined);
  let value:any;try{value=await response.json();}catch(e){if(timed)throw new UncertainTriAction('Response was lost.');throw e;}
  if(timed&&response.status>=500)throw new UncertainTriAction('Server response uncertain.');
  if(!response.ok){const message=messages[value.error]??'Arcade could not process that request. Please try again.';throw timed&&['arcade:stale_action','arcade:database_rejected','arcade:round_intro'].includes(value.error)?new RejectedTriAction(message):timed&&lostResponse?new UncertainTriAction(message):Error(message);}
  if(timed)triTiming('response-parsed',id,performance.now()-started);
  return value as T;
 }
 throw Error('Connection lost. Reconnect to restore your run.');
}

