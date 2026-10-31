import {useEffect,useState} from 'react';
import {delayedRpc} from '@/lib/delayed/client';
import * as browser from '@/lib/webPush/browser';
import {statusText} from '@/lib/webPush/device.mjs';

export interface PushDevice {status:()=>string;prepare:()=>unknown;enableDevice:(id:string)=>Promise<string>;disableDevice:()=>Promise<void>}
export function PushPreferences({userId,matchId,device=browser,rpc=delayedRpc,preview=false}:{userId:string;matchId?:string;device?:PushDevice;rpc?:typeof delayedRpc;preview?:boolean}){
 const [enabled,setEnabled]=useState<boolean|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[state,setState]=useState(device.status);
 useEffect(()=>{let alive=true;setEnabled(null);setError('');
  void rpc<boolean>('async_push_preference',{p_match:matchId??null}).then(v=>{if(alive)setEnabled(v);}).catch(()=>{if(alive)setError('Notification preferences could not be loaded.');});
  Promise.resolve(device.prepare()).catch(()=>{if(alive)setError('This device could not prepare notifications.');});
  const refresh=()=>{if(alive)setState(device.status());};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('ptown-push-device-change',refresh);window.addEventListener('storage',refresh);
  return()=>{alive=false;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('ptown-push-device-change',refresh);window.removeEventListener('storage',refresh);};
 },[userId,matchId,device,rpc]);
 async function save(value:boolean){setPending(true);setError('');try{setEnabled(await rpc<boolean>('async_push_preference',{p_match:matchId??null,p_enabled:value}));}catch{setError('Preference was not saved. Please retry.');}finally{setPending(false);}}
 function enable(){setPending(true);setError('');
  // Invoke synchronously inside the click; state/render/network work never gates the permission prompt.
  void device.enableDevice(userId).then(setState).catch(e=>setError(e.message)).finally(()=>setPending(false));
 }
 return <section className="space-y-3 rounded-lg border p-4" aria-label={matchId?'Match push notifications':'Push notifications'}>
  <h3 className="font-semibold">Push notifications</h3>
  {preview&&<p role="note">Local preview — simulated permission and delivery. No real notifications are sent.</p>}
  <label className="flex items-center gap-3"><input type="checkbox" checked={enabled===true} disabled={enabled===null||pending} onChange={e=>void save(e.target.checked)}/>
   {matchId?'Enable push notifications for this match':'Enable push notifications by default for new async matches'}</label>
  <p className="text-sm">{matchId?'This preference applies only to you in this match.':'Your default is copied into each new match. Existing matches keep their own settings.'}</p>
  <p role="status" className="text-sm">{statusText[state as keyof typeof statusText]}</p>
  {['device-off','permission-needed','revoked'].includes(state)&&<button type="button" className="delayed-primary" disabled={pending} onClick={enable}>Enable on this device</button>}
  {state==='enabled'&&<button type="button" className="delayed-secondary" disabled={pending} onClick={()=>{setPending(true);void device.disableDevice().then(()=>setState(device.status())).catch(()=>setError('Device cleanup could not finish. Please retry.')).finally(()=>setPending(false));}}>Disable on this device</button>}
  <p className="text-sm">Turn availability and 24-hour Last Call only. Delivery depends on browser permission, connectivity and device settings such as Do Not Disturb.</p>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
