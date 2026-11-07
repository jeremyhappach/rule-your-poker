import {useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {resolveOnboardingPushEntry} from '@/lib/mobileOnboarding';
import {prepare,reconcile,setAccount,pushEnabled,pendingRegistration,capturePushDiagnostics} from '@/lib/webPush/browser';

export function PushLifecycle(){
 const {pathname,search}=useLocation(),navigate=useNavigate(),[userId,setUserId]=useState<string|null|undefined>();
 useEffect(()=>{
  if(!pushEnabled)return;let alive=true,changed=false,revision=0;
  const accept=(id:string|null)=>{const request=++revision;void setAccount(id).catch(()=>{}).then(()=>{if(alive&&request===revision)setUserId(id);});};
  const {data}=supabase.auth.onAuthStateChange((event,session)=>{
   if(session||event==='SIGNED_OUT'||event==='INITIAL_SESSION'){changed=true;accept(session?.user.id??null);}
  });
  void supabase.auth.getSession().then(({data,error})=>{if(alive&&!changed&&!error)accept(data.session?.user.id??null);});
  return()=>{alive=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!pushEnabled||!userId)return;
  let alive=true;
  const sync=()=>{
   const registration=prepare();
   // iPhone browser tabs may have no Push/Notification APIs until installed.
   // No worker means there is no pending worker destination to wait for.
   if(!registration){if(alive)resolveOnboardingPushEntry(null);return;}
   // Device maintenance is optional. Only a pending navigation destination
   // needs to precede onboarding; failed push setup must not strand admission.
   // Capture this scoped phone investigation before optional maintenance changes evidence.
   void capturePushDiagnostics(userId).finally(()=>reconcile()).catch(()=>{});
   void registration.then(async()=>{const target=await pendingRegistration(userId);
   const path=target?'/?adminPlayer='+target:null;
   if(alive)resolveOnboardingPushEntry(path);
   if(alive&&path&&pathname+search!==path)navigate(path);
  }).catch(()=>{if(alive)resolveOnboardingPushEntry(null);});};
  const message=(event:MessageEvent)=>{if(event.data?.type==='push-navigation')sync();};
  sync();document.addEventListener('visibilitychange',sync);window.addEventListener('online',sync);
  navigator.serviceWorker?.addEventListener('message',message);
  return()=>{alive=false;document.removeEventListener('visibilitychange',sync);window.removeEventListener('online',sync);navigator.serviceWorker?.removeEventListener('message',message);};
 },[userId,pathname,search,navigate]);
 return null;
}
