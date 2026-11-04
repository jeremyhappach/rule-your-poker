import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Ellipsis,History,LogIn,LogOut} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuSub,DropdownMenuSubContent,DropdownMenuSubTrigger,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {useAccountAccess} from '@/lib/accountAccessContext';
import {claimOnboardingEntry,consumeOnboardingEntry,onboardingPreference,pushEntryReady,subscribePushEntry,type OnboardingDecision,type OnboardingPreference} from '@/lib/mobileOnboarding';
import {supabase} from '@/integrations/supabase/client';
import {MobileOnboardingTutorial} from './MobileOnboardingTutorial';

interface Props {
 userId:string|null;ready:boolean;blocked:boolean;
 onOpenSettings:()=>void;onRules:()=>void;onHistory:()=>void;onLogin:()=>void;onLogout:()=>void;
}
export function LobbyOnboarding({userId,ready,blocked,onOpenSettings,onRules,onHistory,onLogin,onLogout}:Props) {
 const account=useAccountAccess();
 const pushReady=useSyncExternalStore(subscribePushEntry,pushEntryReady);
 const [mode,setMode]=useState<'automatic'|'manual'|null>(null),[menuOpen,setMenuOpen]=useState(false);
 const identity=useRef(userId);identity.current=userId;
 const pending=useRef<{userId:string;promise:Promise<OnboardingPreference>}|null>(null);
 const safe=!!userId&&mode===null&&ready&&!blocked&&!menuOpen&&pushReady&&account?.access.userId===userId&&account.access.enabled&&!account.reminderOpen;
 useEffect(()=>{
  if(!safe||!userId||!claimOnboardingEntry(userId))return;
  let alive=true;
  // Retain the request through temporary startup blockers; consume only when shown.
  if(pending.current?.userId!==userId)pending.current={userId,promise:onboardingPreference(userId,'present',crypto.randomUUID())};
  void pending.current.promise.then(p=>{
   if(alive&&identity.current===userId&&p.userId===userId&&p.eligible&&claimOnboardingEntry(userId)){
    consumeOnboardingEntry(userId);setMode('automatic');
   }
  }).catch(()=>{/* A failed read can be tried on the next entry; Help stays available. */});
  return()=>{alive=false;};
 },[safe,userId]);
 useEffect(()=>{setMode(null);},[userId]);
 useEffect(()=>{if(blocked||account?.reminderOpen)setMode(previous=>previous==='automatic'?null:previous);},[blocked,account?.reminderOpen]);
 const save=async(decision:OnboardingDecision,requestId:string)=>{
  if(!userId)return;
  try {
   const session=await supabase.auth.getSession();
   if(session.data.session?.user.id!==userId)return;
   await onboardingPreference(userId,decision,requestId);
  } catch {
   if(identity.current===userId)toast.error('Your tutorial choice was not saved. Please retry.',{action:{label:'Retry',onClick:()=>void save(decision,requestId)}});
  }
 };
 const close=(decision:OnboardingDecision)=>{const wasAutomatic=mode==='automatic';setMode(null);if(wasAutomatic)void save(decision,crypto.randomUUID());};
 return <>
  <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
   <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 w-8 shrink-0 p-0" title="More options" aria-label="More options"><Ellipsis className="h-4 w-4"/></Button></DropdownMenuTrigger>
   <DropdownMenuContent align="end" collisionPadding={12}>
    <DropdownMenuItem disabled={!userId} onSelect={onHistory}><History className="mr-2 h-4 w-4"/>History</DropdownMenuItem>
    <DropdownMenuSub><DropdownMenuSubTrigger>Help</DropdownMenuSubTrigger><DropdownMenuSubContent collisionPadding={12}>
     <DropdownMenuItem onSelect={()=>{if(userId)consumeOnboardingEntry(userId);setMode('manual');setMenuOpen(false);}}>Install App &amp; Notifications</DropdownMenuItem>
     <DropdownMenuItem onSelect={()=>{onRules();setMenuOpen(false);}}>Game Rules</DropdownMenuItem>
    </DropdownMenuSubContent></DropdownMenuSub>
    <DropdownMenuSeparator/>
    <DropdownMenuItem onSelect={userId?onLogout:onLogin}>{userId?<LogOut className="mr-2 h-4 w-4"/>:<LogIn className="mr-2 h-4 w-4"/>}{userId?'Logout':'Login'}</DropdownMenuItem>
   </DropdownMenuContent>
  </DropdownMenu>
  {mode&&!account?.reminderOpen&&(mode==='manual'||!blocked)&&<MobileOnboardingTutorial onClose={close} onOpenSettings={()=>{close('snooze');onOpenSettings();}}/>}
 </>;
}
