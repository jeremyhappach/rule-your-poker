import {supabase} from '@/integrations/supabase/client';
import {UncertainRun21Action} from '@/lib/run21/actionPresentation';
import {run21Timing} from '@/lib/run21/diagnostics';
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
 const run21=body.game==='run21',timed=body.game==='tri-towers',id=String(body.requestId??'state'),started=performance.now();if(timed)triTiming('request-start',id);
 const mark=(stage:string,detail?:string)=>{if(run21)run21Timing(stage,id,performance.now()-started,detail);};mark('request-start');
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw Error('Sign in to play Arcade.');
 mark('session-ready');let lostResponse=false;if(timed)triTiming('session-ready',id,performance.now()-started);
 for(let attempt=0;attempt<2;attempt++){
  let response:Response;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try {if(timed)triTiming('fetch-dispatch',id,performance.now()-started,String(attempt));mark('fetch-dispatch');response=await fetch('/api/arcade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({...body,presentationVersion:['eleven-up','royal-flash'].includes(body.game as string)?1:4}),signal:controller.signal});}
  catch{mark('request-failed');clearTimeout(timeout);lostResponse=true;if(attempt===0)continue;throw run21?new UncertainRun21Action('Connection lost.'):timed?new UncertainTriAction('Connection lost. Reconnect to restore your game.'):Error('Connection lost. Reconnect to restore your run.');}
  finally{if(!run21)clearTimeout(timeout);}
  mark('response-headers',response.headers.get('Server-Timing')??undefined);
  if(timed)triTiming('response-headers',id,performance.now()-started,response.headers.get('Server-Timing')??undefined);
  let value:any;try{value=await response.json();}catch(e){if(run21)throw new UncertainRun21Action('Response was lost.');if(timed)throw new UncertainTriAction('Response was lost.');throw e;}finally{clearTimeout(timeout);}
  if(run21&&(response.status>=500||lostResponse&&!response.ok))throw new UncertainRun21Action('Server response uncertain.');
  if(timed&&response.status>=500)throw new UncertainTriAction('Server response uncertain.');
  if(!response.ok&&['eleven-up','royal-flash'].includes(body.game as string))throw Error(response.status>=500||lostResponse?'Connection uncertain. Reconnect to retry.':value.error??'arcade:database_rejected');
  if(!response.ok){const message=messages[value.error]??'Arcade could not process that request. Please try again.';throw timed&&['arcade:stale_action','arcade:database_rejected','arcade:round_intro'].includes(value.error)?new RejectedTriAction(message):timed&&lostResponse?new UncertainTriAction(message):Error(message);}
  if(timed)triTiming('response-parsed',id,performance.now()-started);
  mark('response-parsed');return value as T;
 }
 throw Error('Connection lost. Reconnect to restore your run.');
}

