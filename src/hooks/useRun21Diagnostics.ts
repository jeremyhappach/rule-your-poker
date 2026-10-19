import {useEffect} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {startRun21TimingCapture,type TimingGrant} from '@/lib/run21/timingCapture';
/** Eligibility is authenticated server state; no additional auth subscription. */
export function useRun21Diagnostics(userId:string,mode:'arcade'|'multiplayer',identity:string){
 useEffect(()=>{
  const controller=new AbortController();let stop:(()=>void)|undefined;
  const timeout=setTimeout(()=>controller.abort(),8000);
  const load=async()=>{
   const {data,error}=await supabase.rpc('run21_timing_grant' as never).abortSignal(controller.signal);
   const grant=data as TimingGrant|null;
   if(controller.signal.aborted||error||!grant||!Number.isFinite(grant.serverNow)||!Number.isFinite(grant.expiresAt)||grant.expiresAt<=grant.serverNow)return;
   const captureId=crypto.randomUUID();
   stop=startRun21TimingCapture(grant,async(samples,signal)=>{
    const {data:session}=await supabase.auth.getSession();
    if(signal.aborted||session.session?.user.id!==userId)return;
    const {data:saved,error:failure}=await supabase.rpc('run21_store_timing' as never,{p_capture_id:captureId,p_mode:mode,p_samples:samples} as never).abortSignal(signal);
    if(failure||!saved)throw Error('Timing evidence unavailable');
   });
  };
  void load().catch(()=>{/* Optional diagnostics never gate startup. */}).finally(()=>clearTimeout(timeout));
  return()=>{clearTimeout(timeout);controller.abort();stop?.();};
 },[userId,mode,identity]);
}
