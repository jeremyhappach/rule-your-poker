import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {delayedRpc,type Home} from '@/lib/delayed/client';
import {matchLobbyStatus} from '@/lib/delayed/lobbyPresentation';
import {onAsyncActivityInvalidated} from '@/lib/delayed/activityUpdates';

type State={userId:string|null;homes:Home[];loaded:boolean;error:string;serverAt:number;receivedAt:number};
const empty=(userId:string|null):State=>({userId,homes:[],loaded:false,error:'',serverAt:0,receivedAt:0});
const Context=createContext<null|{userId:string|null;matches:ReturnType<typeof matchLobbyStatus>[];count:number;loaded:boolean;error:string;refresh:()=>Promise<void>}>(null);
export const useAsyncActivity=()=>useContext(Context);
export const useAsyncActionCount=()=>useAsyncActivity()?.count??0;

export function AsyncActivityProvider({userId,children}:{userId:string|null;children:ReactNode}){
 const [state,setState]=useState(()=>empty(userId)),[,tick]=useState(0),epoch=useRef(0);
 const location=useLocation();
 const refresh=useCallback(async()=>{
  const request=++epoch.current;if(!userId)return;
  try{
   const value=await delayedRpc<{serverAt:number;matches:Home[]}>('delayed_lobby');
   if(request!==epoch.current)return;
   if(!Array.isArray(value.matches)||!Number.isFinite(value.serverAt))throw Error('Invalid activity response');
   setState(old=>({userId,homes:value.matches.map(home=>{
    const prior=old.userId===userId?old.homes.find(h=>h.id===home.id):undefined;
    return prior&&prior.revision>home.revision?prior:home;
   }),loaded:true,error:'',serverAt:value.serverAt,receivedAt:performance.now()}));
  }catch{if(request===epoch.current)setState(old=>({...old,error:'Unable to refresh async matches.'}));}
 },[userId]);
 useEffect(()=>{
  setState(empty(userId));if(!userId)return;
  const channel=supabase.channel('async-activity:'+userId).on('postgres_changes',
   {event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},()=>void refresh())
   .subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  const focus=()=>{if(!document.hidden)void refresh();};
  const unsubscribe=onAsyncActivityInvalidated(()=>void refresh());
  document.addEventListener('visibilitychange',focus);window.addEventListener('online',focus);void refresh();
  return()=>{epoch.current++;unsubscribe();void supabase.removeChannel(channel);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',focus);};
 },[userId,refresh]);
 // Covers return from every game transport, including a missed realtime delivery.
 useEffect(()=>{if(location.pathname==='/'||location.pathname==='/delayed')void refresh();},[location.key,location.pathname,refresh]);
 const current=state.userId===userId?state:empty(userId);
 const now=current.serverAt+performance.now()-current.receivedAt;
 const matches=current.homes.map(home=>matchLobbyStatus(home,userId??'',now))
  .filter(m=>m.home.status!=='settled'||m.results>0||m.finale)
  .sort((a,b)=>Number(b.actionable)-Number(a.actionable));
 const nextDeadline=Math.min(...matches.map(m=>m.nextDeadline));
 useEffect(()=>{
  if(!Number.isFinite(nextDeadline))return;
  const timer=setTimeout(()=>tick(n=>n+1),Math.max(0,Math.ceil(nextDeadline-current.serverAt-performance.now()+current.receivedAt)));
  return()=>clearTimeout(timer);
 },[nextDeadline,current.serverAt,current.receivedAt]);
 return <Context.Provider value={{userId,matches,count:matches.filter(m=>m.actionable).length,loaded:current.loaded,error:current.error,refresh}}>{children}</Context.Provider>;
}
