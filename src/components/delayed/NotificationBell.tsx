import {createContext,useContext,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Bell} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {delayedRpc} from '@/lib/delayed/client';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {clearPrivateDrafts} from '@/lib/delayed/drafts';
import '@/lib/delayed/delayed.css';
type Notice={id:string;match_id:string;kind:string;actionable:boolean;revision:number;read_revision:number;payload:{opponentId:string;availableCount:number;earliestDeadline:string|null;lastCall:boolean;status:string}};
const NotificationContext=createContext<{items:Notice[];count:number;error:string;refresh:()=>Promise<void>;setError:(s:string)=>void}|null>(null);
export function NotificationProvider({children}:{children:ReactNode}){
 const [userId,setUserId]=useState<string|null>(null),[items,setItems]=useState<Notice[]>([]),[count,setCount]=useState(0),[error,setError]=useState('');
 const generation=useRef(0);
 useEffect(()=>{let alive=true;void supabase.auth.getSession().then(({data})=>{if(alive)setUserId(data.session?.user.id??null);});
  const {data}=supabase.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')clearPrivateDrafts();setUserId(session?.user.id??null);});
  return()=>{alive=false;data.subscription.unsubscribe();};},[]);
 const refresh=useCallback(async()=>{
  const request=++generation.current;if(!userId)return;
  try{const value=await delayedRpc<{items:Notice[];actionable:number}>('platform_notification_center');
   if(request===generation.current){setItems(value.items);setCount(value.actionable);setError('');}}
  catch{if(request===generation.current)setError('Notifications unavailable.');}
 },[userId]);
 useEffect(()=>{setItems([]);setCount(0);setError('');if(!userId)return;
  const channel=supabase.channel('platform-notifications:'+userId).on('postgres_changes',{event:'*',schema:'public',table:'platform_notifications',filter:'user_id=eq.'+userId},()=>void refresh())
   .subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  const focus=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',focus);window.addEventListener('online',focus);void refresh();
  return()=>{generation.current++;void supabase.removeChannel(channel);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',focus);};
 },[userId,refresh]);
 return <NotificationContext.Provider value={userId?{items,count,error,refresh,setError}:null}>{children}</NotificationContext.Provider>;
}
export function NotificationBell(){
 const context=useContext(NotificationContext);if(!context)return null;
 const {items,count,error,refresh,setError}=context;
 return <Popover><PopoverTrigger asChild><button className="delayed-bell" aria-label={`Notifications${count?`, ${count} requiring action`:''}`}>
  <Bell size={19}/>{count>0&&<span>{count}</span>}</button></PopoverTrigger><PopoverContent className="w-80 max-w-full" align="end">
  <h2 className="font-semibold">Notifications</h2>{error?<p role="alert">{error} <button onClick={()=>void refresh()}>Retry</button></p>:
   items.length===0?<p>No notifications.</p>:<ul className="space-y-3">{items.map(n=><li key={n.id}>
    <Link to={'/delayed/'+n.match_id} onClick={()=>{void delayedRpc('delayed_notification_read',{p_id:n.id,p_revision:n.revision}).then(refresh).catch(()=>setError('Unable to mark read.'));}}>
     <strong>{n.kind==='invitation'?'Match invitation':n.kind==='turn'?(n.payload.lastCall?'Last Call':'Your turn'):
      n.kind==='settled'?'Match settled':'Invitation '+n.payload.status}</strong>
     {n.kind==='turn'&&<span> · {n.payload.availableCount} available {n.payload.availableCount===1?'turn':'turns'}</span>}
     {n.payload.earliestDeadline&&<small className="block">Earliest deadline: {new Date(n.payload.earliestDeadline).toLocaleString()}</small>}
     {!n.actionable&&<small className="block">For your records</small>}
    </Link></li>)}</ul>}
  <Link className="block mt-3 underline" to="/delayed">All delayed matches</Link>
 </PopoverContent></Popover>;
}
