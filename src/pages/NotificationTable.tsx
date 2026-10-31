import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {useAuthGuard} from '@/hooks/useAuthGuard';
import {delayedRpc} from '@/lib/delayed/client';
import {RealMoneyWarningDialog} from '@/components/RealMoneyWarningDialog';

/** Read-only notification entry. The ordinary table owns observation and seating. */
export default function NotificationTable(){
 const {user,isReady}=useAuthGuard({pageLabel:'Table notification'}),{sessionId}=useParams(),navigate=useNavigate();
 const [status,setStatus]=useState<'checking'|'available'|'unavailable'>('checking');
 const requestVersion=useRef(0);
 useEffect(()=>{const version=++requestVersion.current;setStatus('checking');
  if(isReady&&user&&sessionId)void delayedRpc<{sessionId:string}|null>('notification_table',{p_session:sessionId})
   .then(v=>{if(version===requestVersion.current)setStatus(v?.sessionId===sessionId?'available':'unavailable');}).catch(()=>{if(version===requestVersion.current)setStatus('unavailable');});
  return()=>{++requestVersion.current;};
 },[user?.id,isReady,sessionId]);
 async function confirm(){
  const version=++requestVersion.current;setStatus('checking');
  try{const v=await delayedRpc<{sessionId:string}|null>('notification_table',{p_session:sessionId});
   if(version!==requestVersion.current)return;
   if(v?.sessionId===sessionId)navigate('/game/'+sessionId,{replace:true});else setStatus('unavailable');
  }catch{if(version===requestVersion.current)setStatus('unavailable');}
 }
 return <main className="mx-auto max-w-lg space-y-4 p-6">
  <h1 className="text-xl font-semibold">Table notification</h1>
  {status==='checking'?<p role="status">Checking table availability…</p>:status==='unavailable'?<p role="status">This table is no longer available to join. It may be closed, full, or unavailable to your account.</p>:<p>View this table as an observer. Choose a seat only if you want to join.</p>}
  <Link className="underline" to="/">Back to Lobby</Link>
  <RealMoneyWarningDialog open={isReady&&!!user&&status==='available'} onConfirm={()=>void confirm()} onCancel={()=>navigate('/',{replace:true})}/>
 </main>;
}
