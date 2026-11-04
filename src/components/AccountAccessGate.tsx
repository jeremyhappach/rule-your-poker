import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {accountRpc,sendVerification,emailDeliveryMessage,type AccountAccess} from '@/lib/accountAccess';
import {Button} from '@/components/ui/button';
import {AccountAccessContext} from '@/lib/accountAccessContext';
import {cancelOnboardingEntry,onboardingAuthEvent} from '@/lib/mobileOnboarding';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';

export function AccountAccessGate({children}:{children:ReactNode}) {
 const location=useLocation();
 useEffect(()=>{if(!['/','/auth'].includes(location.pathname)||!['','?launch=home'].includes(location.search)||location.hash)cancelOnboardingEntry();},[location.pathname,location.search,location.hash]);
 const [identity,setIdentity]=useState<string|null|undefined>(undefined);
 const [access,setAccess]=useState<AccountAccess|null>(null),[error,setError]=useState('');
 const [dismissed,setDismissed]=useState(false),[sending,setSending]=useState(false),[message,setMessage]=useState('');
 const revision=useRef(0),identityRef=useRef<string|null|undefined>();
 const initialAttempt=useRef('');
 const load=useCallback(async(id:string)=>{
  const attempt=++revision.current;
  try{const value=await accountRpc<AccountAccess>('account_access_snapshot');
   if(attempt!==revision.current||identityRef.current!==id)return;
   if(!value||value.userId!==id)throw Error('Your account access could not be checked.');
   setAccess(previous=>previous&&previous.userId===id&&previous.revision>value.revision?previous:value);setError('');
  }catch{if(attempt===revision.current&&identityRef.current===id){setError('Your account access could not be checked. Please retry.');}}
 },[]);
 useEffect(()=>{
  let alive=true,authEvents=0;
  const admit=(id:string|null)=>{
   if(!alive)return;
   if(id!==identityRef.current){++revision.current;identityRef.current=id;setIdentity(id);setAccess(null);setError('');setDismissed(false);setMessage('');}
   if(id)void load(id);
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   onboardingAuthEvent(event);
   ++authEvents;
   // Foreground SIGNED_IN and token refresh do not create another launch.
   if(session||event==='SIGNED_OUT'||event==='INITIAL_SESSION'&&identityRef.current===undefined)queueMicrotask(()=>admit(session?.user.id??null));
  });
  const captured=authEvents;
  void supabase.auth.getSession().then(({data:{session}})=>{if(authEvents===captured)admit(session?.user.id??null);}).catch(()=>{if(alive)setError('Your session could not be checked. Please reload.');});
  return()=>{alive=false;++revision.current;subscription.unsubscribe();};
 },[load]);
 useEffect(()=>{
  if(!identity)return;
  const refresh=()=>{if(document.visibilityState==='visible')void load(identity);};
  const channel=supabase.channel(`account-access:${identity}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'account_access',filter:`user_id=eq.${identity}`},payload=>{
   if(identityRef.current!==identity)return;
   if(payload.new.enabled===false)setAccess(previous=>previous&&Number(payload.new.revision)>=previous.revision?{...previous,revision:Number(payload.new.revision),enabled:false,status:payload.new.ever_enabled?'suspended':'pending'}:previous);
   void load(identity);
  }).subscribe(status=>{if(status==='SUBSCRIBED')void load(identity);});
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{void supabase.removeChannel(channel);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[identity,load]);
 useEffect(()=>{
  if(!access||access.verified||access.status==='suspended'||access.emailDelivery!=='not_requested')return;
  const key=access.userId+':'+access.email;
  if(initialAttempt.current===key)return;
  initialAttempt.current=key;
  const id=access.userId;setSending(true);
  void sendVerification(id,true).catch(e=>{if(identityRef.current===id)setMessage(e instanceof Error?e.message:'Email could not be sent. Please resend.');})
   .finally(()=>{if(identityRef.current===id){setSending(false);void load(id);}});
 },[access,load]);
 const publicAuth=location.pathname==='/auth'||location.pathname==='/verify-email';
 useEffect(()=>{
  if(publicAuth||identity===null||error||access&&!access.enabled||location.pathname!=='/')
   window.dispatchEvent(new Event('ptown:launch-cover-ready'));
 },[publicAuth,identity,error,access,location.pathname]);
 if(publicAuth||identity===null)return <>{children}</>;
 if(identity===undefined||!access)return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><div role="status" className="space-y-4 text-center"><p>{error||'Checking account access…'}</p>{error&&<Button onClick={()=>identity?void load(identity):window.location.reload()}>Retry</Button>}<Button variant="ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sign out</Button></div></main>;
 const verification=<div className="space-y-3"><p className="break-all text-sm">{access.email}</p><p role={access.emailDelivery==='failed'?'alert':'status'} className="text-sm">{message||emailDeliveryMessage(access.emailDelivery)}</p><Button disabled={sending} onClick={async()=>{const id=access.userId;setSending(true);setMessage('');try{await sendVerification(id);if(identityRef.current===id)setMessage('Verification email requested. Check your inbox and spam folder.');}catch(e){if(identityRef.current===id)setMessage(e instanceof Error?e.message:'Could not send email.');}finally{if(identityRef.current===id){setSending(false);void load(id);}}}}>Resend verification email</Button></div>;
 if(!access.enabled)return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><div className="max-w-md space-y-4 text-center"><h1 className="text-2xl font-semibold">{access.status==='pending'?'Account Pending Admin Approval':'Account Suspended — Contact Administrator.'}</h1>{access.status==='pending'&&<><p>Your account is registered. An administrator must enable gameplay access.</p>{!access.verified&&verification}</>}<Button variant="outline" onClick={()=>void load(access.userId)}>Check status</Button><Button variant="ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sign out</Button></div></main>;
 return <AccountAccessContext.Provider value={{access,reminderOpen:!access.verified&&!dismissed}}>{children}<Dialog open={!access.verified&&!dismissed} onOpenChange={open=>{if(!open)setDismissed(true);}}><DialogContent><DialogHeader><DialogTitle>Your email is not verified</DialogTitle><DialogDescription>Please verify your email address to help secure your account.</DialogDescription></DialogHeader>{verification}<Button variant="ghost" onClick={()=>setDismissed(true)}>Continue playing</Button></DialogContent></Dialog></AccountAccessContext.Provider>;
}
