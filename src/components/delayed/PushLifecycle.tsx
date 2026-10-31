import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {prepare,reconcile,setAccount,foreground,pushEnabled} from '@/lib/webPush/browser';

export function PushLifecycle(){
 const {pathname}=useLocation(),[userId,setUserId]=useState<string|null|undefined>();
 useEffect(()=>{
  if(!pushEnabled)return;let alive=true,changed=false;
  const accept=(id:string|null)=>{void setAccount(id).catch(()=>{});if(alive)setUserId(id);};
  const {data}=supabase.auth.onAuthStateChange((event,session)=>{
   if(session||event==='SIGNED_OUT'||event==='INITIAL_SESSION'){changed=true;accept(session?.user.id??null);}
  });
  void supabase.auth.getSession().then(({data,error})=>{if(alive&&!changed&&!error)accept(data.session?.user.id??null);});
  return()=>{alive=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!pushEnabled||!userId)return;
  const matchId=/^\/delayed\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname)?.[1]??null;
  const sync=()=>{void prepare()?.then(()=>reconcile()).then(()=>foreground(document.hidden?null:matchId)).catch(()=>{});};
  sync();document.addEventListener('visibilitychange',sync);window.addEventListener('online',sync);
  // Renewal of an expiring suppression lease, never gameplay/notification polling.
  const timer=setInterval(sync,30000);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',sync);window.removeEventListener('online',sync);void foreground(null).catch(()=>{});};
 },[userId,pathname]);
 return null;
}
