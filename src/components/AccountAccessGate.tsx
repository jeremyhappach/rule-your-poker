import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '@/integrations/supabase/client';
import {accountRpc,sendVerification,emailDeliveryMessage,type AccountAccess} from '@/lib/accountAccess';
import {Button} from '@/components/ui/button';
import {AccountAccessContext} from '@/lib/accountAccessContext';
import {cancelOnboardingEntry,onboardingAuthEvent} from '@/lib/mobileOnboarding';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {accountCheckTimeout} from '@/lib/accountCheckTimeout';
import {currentSession,usePushMatchNavigation} from '@/hooks/usePushMatchNavigation';
import {isSplashAuthEntry,isSplashLobbyEntry,launchSplash} from '@/lib/launchSplash';

export function AccountAccessGate({children}:{children:ReactNode}) {
 const location=useLocation(),navigate=useNavigate();
 useEffect(()=>{if(!['/','/auth'].includes(location.pathname)||!['','?launch=home'].includes(location.search)||location.hash)cancelOnboardingEntry();},[location.pathname,location.search,location.hash]);
 const [identity,setIdentity]=useState<string|null|undefined>(undefined);
 const [session,setSession]=useState<Session|null|undefined>();
 const [checkingAccess,setCheckingAccess]=useState(false),[checkingSession,setCheckingSession]=useState(true);
 const [access,setAccess]=useState<AccountAccess|null>(null),[error,setError]=useState('');
 const [dismissed,setDismissed]=useState(false),[sending,setSending]=useState(false),[message,setMessage]=useState('');
 const revision=useRef(0),identityRef=useRef<string|null|undefined>();
 const initialAttempt=useRef('');
 const [sessionAttempt,setSessionAttempt]=useState(0);
 const restoreSession=useCallback(()=>{setAccess(null);setError('');setCheckingSession(true);setSessionAttempt(n=>n+1);},[]);
 const {pending,clear:clearPending}=usePushMatchNavigation({session,access,checking:checkingAccess||checkingSession,error,restoreSession});
 const inFlight=useRef<{id:string;attempt:number}|null>(null);
 const load=useCallback(async(id:string)=>{
  if(inFlight.current?.id===id)return;
  const attempt=++revision.current;
  inFlight.current={id,attempt};setError('');setCheckingAccess(true);
  try{const value=await accountCheckTimeout(accountRpc<AccountAccess>('account_access_snapshot'));
   if(attempt!==revision.current||identityRef.current!==id)return;
   if(!value||value.userId!==id)throw Error('Your account access could not be checked.');
   setAccess(previous=>previous&&previous.userId===id&&previous.revision>value.revision?previous:value);setError('');
  }catch{if(attempt===revision.current&&identityRef.current===id){setError('Your account access could not be checked. Please retry.');}}
  finally{if(inFlight.current?.attempt===attempt){inFlight.current=null;setCheckingAccess(false);}}
 },[]);
 useEffect(()=>{
  let alive=true,authEvents=0;
  const admit=(value:Session|null)=>{
   if(!alive)return;
   const id=value?.user.id??null;
   setSession(value);setCheckingSession(false);
   if(id!==identityRef.current){++revision.current;inFlight.current=null;setCheckingAccess(false);identityRef.current=id;setIdentity(id);setAccess(null);setError('');setDismissed(false);setMessage('');}
   if(value&&!currentSession(value)){++revision.current;inFlight.current=null;setCheckingAccess(false);setAccess(null);setError('Your session has expired. Please retry or sign in again.');return;}
   if(id)void load(id);
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   onboardingAuthEvent(event);
   if(event==='SIGNED_OUT')clearPending();
   // Foreground SIGNED_IN and token refresh do not create another launch.
   if(session||event==='SIGNED_OUT'||event==='INITIAL_SESSION'&&identityRef.current===undefined){++authEvents;setTimeout(()=>admit(session),0);}
  });
  const captured=authEvents;
  void accountCheckTimeout(supabase.auth.getSession()).then(({data:{session},error})=>{if(error)throw error;if(authEvents===captured)admit(session);}).catch(()=>{if(alive&&authEvents===captured){setCheckingSession(false);setError('Your session could not be checked. Please retry.');}});
  return()=>{alive=false;++revision.current;inFlight.current=null;subscription.unsubscribe();};
 },[load,sessionAttempt,clearPending]);
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
  // Let the same cold-launch presentation hand its decoded opening frame to
  // Auth after Index redirects a signed-out Home Screen entry. No auth is delayed.
  if((identity===null||identity===undefined)&&launchSplash.eligible&&!error
   &&(isSplashLobbyEntry(location)||isSplashAuthEntry(location)))return;
  if(publicAuth||identity===null||error||access&&!access.enabled||location.pathname!=='/')
   window.dispatchEvent(new Event('ptown:launch-cover-ready'));
 },[publicAuth,identity,error,access,location.pathname,location.search,location.hash]);
 if(publicAuth||identity===null)return <>{children}</>;
 if(identity===undefined||!access||session&&!currentSession(session)||pending&&error)return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><div role={error?'alert':'status'} className="space-y-4 text-center"><p>{error||'Checking account access…'}</p>{error&&<><Button onClick={()=>{setError('');if(identity&&currentSession(session))void load(identity);else restoreSession();}}>Retry</Button><Button variant="outline" onClick={()=>{clearPending();navigate('/',{replace:true});}}>Back to Lobby</Button></>}<Button variant="ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sign out</Button></div></main>;
 const verification=<div className="space-y-3"><p className="break-all text-sm">{access.email}</p><p role={access.emailDelivery==='failed'?'alert':'status'} className="text-sm">{message||emailDeliveryMessage(access.emailDelivery)}</p><Button disabled={sending} onClick={async()=>{const id=access.userId;setSending(true);setMessage('');try{await sendVerification(id);if(identityRef.current===id)setMessage('Verification email requested. Check your inbox and spam folder.');}catch(e){if(identityRef.current===id)setMessage(e instanceof Error?e.message:'Could not send email.');}finally{if(identityRef.current===id){setSending(false);void load(id);}}}}>Resend verification email</Button></div>;
 if(!access.enabled)return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><div className="max-w-md space-y-4 text-center"><h1 className="text-2xl font-semibold">{access.status==='pending'?'Account Pending Admin Approval':'Account Suspended — Contact Administrator.'}</h1>{access.status==='pending'&&<><p>Your account is registered. An administrator must enable gameplay access.</p>{!access.verified&&verification}</>}<Button variant="outline" onClick={()=>void load(access.userId)}>Check status</Button><Button variant="ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sign out</Button></div></main>;
 return <AccountAccessContext.Provider value={{access,reminderOpen:!access.verified&&!dismissed}}>{children}<Dialog open={!access.verified&&!dismissed} onOpenChange={open=>{if(!open)setDismissed(true);}}><DialogContent><DialogHeader><DialogTitle>Your email is not verified</DialogTitle><DialogDescription>Please verify your email address to help secure your account.</DialogDescription></DialogHeader>{verification}<Button variant="ghost" onClick={()=>setDismissed(true)}>Continue playing</Button></DialogContent></Dialog></AccountAccessContext.Provider>;
}
