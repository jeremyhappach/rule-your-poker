import {startTransition,createContext,useContext,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {compactTurnTime,turnDestination,turnEntryHint} from '@/lib/delayed/notifications';
import type {Home} from '@/lib/delayed/client';
import {AsyncActivityProvider} from './AsyncActivity';
export {useAsyncActionCount} from './AsyncActivity';
import {Bell} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {delayedRpc} from '@/lib/delayed/client';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {clearPrivateDrafts} from '@/lib/delayed/drafts';
import '@/lib/delayed/delayed.css';
type Notice={id:string;match_id:string;registration_user_id?:string;kind:string;actionable:boolean;revision:number;read_revision:number;payload:{username?:string;email?:string;registeredAt?:string;opponentId:string;opponentName?:string;completionCount?:number;availableCount:number;earliestDeadline:string|null;lastCall:boolean;status:string}};
const NotificationContext=createContext<{userId:string;items:Notice[];count:number;clock:{server:number;at:number};error:string;refresh:()=>Promise<void>;setError:(s:string)=>void}|null>(null);
export function NotificationProvider({children}:{children:ReactNode}){
 const [userId,setUserId]=useState<string|null|undefined>(),[items,setItems]=useState<Notice[]>([]),[count,setCount]=useState(0),[error,setError]=useState('');
 const generation=useRef(0);
 const [clock,setClock]=useState(()=>({server:Date.now(),at:performance.now()}));
 useEffect(()=>{let alive=true,changed=false;void supabase.auth.getSession().then(({data,error})=>{if(alive&&!changed&&!error)setUserId(data.session?.user.id??null);});
  const {data}=supabase.auth.onAuthStateChange((event,session)=>{changed=true;if(event==='SIGNED_OUT')clearPrivateDrafts();setUserId(session?.user.id??null);});
  return()=>{alive=false;data.subscription.unsubscribe();};},[]);
 const refresh=useCallback(async()=>{
  const request=++generation.current;if(!userId)return;
  try{const value=await delayedRpc<{items:Notice[];actionable:number;serverAt?:number}>('platform_notification_center');
   if(request!==generation.current)return;
   setClock({server:value.serverAt??Date.now(),at:performance.now()});
   setItems(value.items.map(n=>n.kind==='invitation'?{...n,payload:{...n.payload,opponentName:undefined}}:n));setCount(value.actionable);setError('');
   // Existing invitation rows carry UUIDs, not names. Resolve through the
   // participant-checked match projection; never invent a display identity.
   const homes=new Map<string,Promise<Home>>();
   const named=await Promise.all(value.items.map(async n=>{
    if(n.kind!=='invitation')return n;
    try{if(!homes.has(n.match_id))homes.set(n.match_id,delayedRpc<Home>('delayed_home',{p_match:n.match_id}));
     const h=await homes.get(n.match_id)!;
     if(h.id!==n.match_id||h.opponent!==userId||h.organizer!==n.payload.opponentId)return {...n,payload:{...n.payload,opponentName:undefined}};
     return {...n,payload:{...n.payload,opponentName:h.players.find(p=>p.id===h.organizer)?.name?.trim()||undefined}};
    }catch{return {...n,payload:{...n.payload,opponentName:undefined}};}
   }));
   if(request===generation.current)setItems(named);}
  catch{if(request===generation.current)setError('Notifications unavailable.');}
 },[userId]);
 useEffect(()=>{setItems([]);setCount(0);setError('');if(!userId)return;
  const channel=supabase.channel('platform-notifications:'+userId).on('postgres_changes',{event:'*',schema:'public',table:'platform_notifications',filter:'user_id=eq.'+userId},()=>void refresh())
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},()=>void refresh())
   .subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  const focus=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',focus);window.addEventListener('online',focus);void refresh();
  return()=>{generation.current++;void supabase.removeChannel(channel);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',focus);};
 },[userId,refresh]);
 // A known server deadline invalidates availability once; this is not a poll.
 useEffect(()=>{if(!userId)return;const deadline=Math.min(...items.filter(n=>n.kind==='turn').map(n=>Date.parse(n.payload.earliestDeadline??'')).filter(Number.isFinite));
  if(!Number.isFinite(deadline))return;const timer=setTimeout(()=>void refresh(),Math.max(0,deadline-clock.server-(performance.now()-clock.at)));
  return()=>clearTimeout(timer);
 },[userId,items,clock,refresh]);
 return <AsyncActivityProvider userId={userId??null} authResolved={userId!==undefined}><NotificationContext.Provider value={userId?{userId,items,count,clock,error,refresh,setError}:null}>{children}</NotificationContext.Provider></AsyncActivityProvider>;
}
export function NotificationInbox({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
 const context=useContext(NotificationContext);return open&&context?<NotificationBellContent context={context} textOnly onDismiss={()=>onOpenChange(false)}/>:null;
}
export function NotificationBell({textOnly=false}:{textOnly?:boolean}){
 const context=useContext(NotificationContext);if(!context)return null;
 return <NotificationBellContent context={context} textOnly={textOnly}/>;
}
function NotificationBellContent({context,textOnly,onDismiss}:{context:NonNullable<React.ContextType<typeof NotificationContext>>;textOnly:boolean;onDismiss?:()=>void}){
 const location=useLocation(),navigate=useNavigate();
 const [open,setOpen]=useState(textOnly),[tick,setTick]=useState(()=>performance.now());
 useEffect(()=>{if(textOnly)void context.refresh();},[textOnly,context.refresh]);
 useEffect(()=>{if(!open)return;setTick(performance.now());const timer=setInterval(()=>setTick(performance.now()),60000);return()=>clearInterval(timer);},[open]);
 if(!textOnly&&location.pathname!=='/')return null;
 const {userId,items,count,clock,error,refresh,setError}=context;
 const now=clock.server+Math.max(0,tick-clock.at);
 const destination=(n:Notice)=>n.kind==='registration'?'/?adminPlayer='+n.registration_user_id:'/delayed/'+n.match_id+(n.kind==='settled'?'?finale=1':'');
 const markRead=(n:Notice)=>delayedRpc('delayed_notification_read',{p_id:n.id,p_revision:n.revision}).then(refresh).catch(()=>setError('Unable to mark read.'));
 const openTurn=async(n:Notice)=>{try{const home=await delayedRpc<Home>('delayed_home',{p_match:n.match_id});void markRead(n);const destination=turnDestination(home,userId);onDismiss?.();startTransition(()=>navigate(destination,{state:turnEntryHint(home,destination.split('/play/')[1]??'',userId)}));}catch{setError('Unable to verify the current turn. Please retry.');}};
 const contents=<>{error?<p role="alert">{error} <button onClick={()=>void refresh()}>Retry</button></p>:
   items.length===0?<p>No notifications.</p>:<ul className="async-notification-list">{items.map(n=><li key={n.kind==='turn'?'turn:'+n.match_id:n.id} data-match-id={n.match_id}>
    {n.kind==='turn'?<div className="async-notification-turn"><button onClick={()=>void openTurn(n)}>YOUR TURN</button><span className="async-notification-opponent">vs {n.payload.opponentName?.trim()||'your opponent'}</span>{n.payload.earliestDeadline&&<time>({compactTurnTime(n.payload.earliestDeadline,now)})</time>}</div>:<>
    <Link to={destination(n)} onClick={event=>{void markRead(n);if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onDismiss?.();startTransition(()=>navigate(destination(n)));}}}>
     <strong>{n.kind==='registration'?'Approval required · '+(n.payload.username??'New player'):n.kind==='invitation'?'Pending invite'+(n.payload.opponentName?' from '+n.payload.opponentName:''):n.kind==='accepted'?(n.payload.opponentName??'Your opponent')+' accepted your match!':n.kind==='results'?`${n.payload.completionCount} game completions ready to view`:n.kind==='settled'?'Match complete · View results':'Invitation '+n.payload.status}</strong>
     {n.kind==='registration'&&<><small className="block break-all">{n.payload.email}</small><span className="block underline">Open player approval</span></>}{n.kind==='accepted'&&<small className="block">No turns yet available</small>}
     {!n.actionable&&<small className="block">For your records</small>}
    </Link></>}</li>)}</ul>}</>;
 if(textOnly)return <Dialog open onOpenChange={value=>{if(!value)onDismiss?.();}}><DialogContent className="async-notification-popover"><DialogTitle>Notifications</DialogTitle><DialogDescription>Invitations, turns, results and account actions.</DialogDescription>{contents}</DialogContent></Dialog>;
 return <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)void refresh();}}><PopoverTrigger asChild><button className={textOnly?"midnight-notifications":"delayed-bell"} data-pending={count>0||undefined} data-ring={!textOnly&&count>0&&(location.pathname==='/'||location.pathname==='/delayed')||undefined} aria-label={`Notifications${count?`, ${count} pending`:''}`}>
  {textOnly?"Notifications":<Bell size={19}/>} {count>0&&<span>{count}</span>}</button></PopoverTrigger><PopoverContent className="w-80 max-w-full async-notification-popover" align="end">
{contents}
 </PopoverContent></Popover>;
}
