import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {CircleHelp} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {useAccountAccess} from '@/lib/accountAccessContext';
import {claimOnboardingEntry,onboardingPreference,pushEntryReady,subscribePushEntry,type OnboardingDecision} from '@/lib/mobileOnboarding';
import {supabase} from '@/integrations/supabase/client';
import {MobileOnboardingTutorial} from './MobileOnboardingTutorial';

export function LobbyOnboarding({userId,ready,blocked,onOpenSettings,onRules}:{userId:string;ready:boolean;blocked:boolean;onOpenSettings:()=>void;onRules:()=>void}) {
 const account=useAccountAccess();
 const pushReady=useSyncExternalStore(subscribePushEntry,pushEntryReady);
 const [mode,setMode]=useState<'automatic'|'manual'|null>(null),[menuOpen,setMenuOpen]=useState(false);
 const identity=useRef(userId);identity.current=userId;
 const safe=mode===null&&ready&&!blocked&&!menuOpen&&pushReady&&account?.access.userId===userId&&account.access.enabled&&!account.reminderOpen;
 useEffect(()=>{
  if(!safe||!claimOnboardingEntry(userId))return;
  let alive=true;
  void onboardingPreference(userId,'present',crypto.randomUUID()).then(p=>{if(alive&&identity.current===userId&&p.userId===userId&&p.eligible)setMode('automatic');}).catch(()=>{/* Failed reads never interrupt the lobby. */});
  return()=>{alive=false;};
 },[safe,userId]);
 useEffect(()=>{setMode(null);},[userId]);
 useEffect(()=>{if(blocked||account?.reminderOpen)setMode(previous=>previous==='automatic'?null:previous);},[blocked,account?.reminderOpen]);
 const save=async(decision:OnboardingDecision,requestId:string)=>{
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
  <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Help" aria-label="Help"><CircleHelp className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>{claimOnboardingEntry(userId);setMode('manual');}}>Install App &amp; Notifications</DropdownMenuItem><DropdownMenuItem onSelect={onRules}>Game Rules</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  {mode&&!account?.reminderOpen&&(mode==='manual'||!blocked)&&<MobileOnboardingTutorial onClose={close} onOpenSettings={()=>{close('snooze');onOpenSettings();}}/>}
 </>;
}
