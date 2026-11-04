import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {delayedRpc} from '@/lib/delayed/client';
import * as browser from '@/lib/webPush/browser';
import {statusText} from '@/lib/webPush/device.mjs';

export interface PushDevice {status:()=>string;prepare:()=>unknown;enableDevice:(id:string)=>Promise<string>;disableDevice:()=>Promise<void>}
export interface NotificationPreferences {
 registrations?:boolean;
 invitations:boolean;asyncDefault:boolean;newTable:boolean;quietEnabled:boolean;quietStart:string;quietEnd:string;quietZone:string;
}
const initial:NotificationPreferences={invitations:false,asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC'};
export function PushPreferences({userId,matchId,device=browser,rpc=delayedRpc,preview=false}:{userId:string;matchId?:string;device?:PushDevice;rpc?:typeof delayedRpc;preview?:boolean}){
 const deviceEnabled=browser.pushEnabled||preview;
 const [enabled,setEnabled]=useState<boolean|null>(null),[preferences,setPreferences]=useState<NotificationPreferences|null>(null);
 const [quiet,setQuiet]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 const [state,setState]=useState(()=>deviceEnabled?device.status():'inactive');
 const [expanded,setExpanded]=useState(false),detailsId=useId();
 useEffect(()=>{setExpanded(false);},[userId,matchId]);
 const requestVersion=useRef(0),matchVersion=useRef(0),saving=useRef(false);
 useEffect(()=>{
  let alive=true;setEnabled(null);setPreferences(null);setError('');
  const load=()=>{
   if(saving.current)return;const version=++requestVersion.current,matchRequest=++matchVersion.current;
   void rpc<NotificationPreferences>('notification_preferences').then(p=>{if(alive&&version===requestVersion.current){setPreferences(p);setQuiet(p);}}).catch(()=>{if(alive&&version===requestVersion.current)setError('Notification preferences could not be loaded.');});
   if(matchId)void rpc<boolean>('async_push_preference',{p_match:matchId}).then(v=>{if(alive&&matchRequest===matchVersion.current)setEnabled(v);}).catch(()=>{if(alive&&matchRequest===matchVersion.current)setError('Match preference could not be loaded.');});
  };
  load();if(deviceEnabled)void Promise.resolve(device.prepare()).catch(()=>{if(alive)setError('This device could not prepare notifications.');});
  const refresh=()=>{if(alive&&deviceEnabled)setState(device.status());};
  const changed=(event:Event)=>{
   const detail=(event as CustomEvent).detail;
   if(detail?.userId===userId&&detail?.preferences){++requestVersion.current;setPreferences(detail.preferences);setQuiet(detail.preferences);}
  };
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  window.addEventListener('ptown-push-device-change',refresh);window.addEventListener('storage',refresh);
  window.addEventListener('ptown-notification-preferences',changed);window.addEventListener('focus',load);
  return()=>{alive=false;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);
   window.removeEventListener('ptown-push-device-change',refresh);window.removeEventListener('storage',refresh);
   window.removeEventListener('ptown-notification-preferences',changed);window.removeEventListener('focus',load);++requestVersion.current;++matchVersion.current;};
 },[userId,matchId,device,rpc,deviceEnabled]);
 async function save(patch:Partial<NotificationPreferences>){
  setPending(true);saving.current=true;setError('');setSaved('');const version=++requestVersion.current;
  try{const p=await rpc<NotificationPreferences>('notification_preferences',{p_patch:patch});if(version===requestVersion.current){setPreferences(p);setQuiet(p);setSaved('Preferences saved.');window.dispatchEvent(new CustomEvent('ptown-notification-preferences',{detail:{userId,preferences:p}}));}}
  catch{if(version===requestVersion.current)setError('Preferences were not saved. Check the times and IANA time zone, then retry.');}finally{saving.current=false;setPending(false);}
 }
 async function saveMatch(value:boolean){
  setPending(true);saving.current=true;setError('');const version=++matchVersion.current;
  try{const v=await rpc<boolean>('async_push_preference',{p_match:matchId,p_enabled:value});if(version===matchVersion.current)setEnabled(v);}
  catch{if(version===matchVersion.current)setError('Preference was not saved. Please retry.');}finally{saving.current=false;setPending(false);}
 }
 function enable(){
  if(!deviceEnabled)return;
  setPending(true);setError('');
  // Permission request stays synchronous with this explicit user gesture.
  void device.enableDevice(userId).then(setState).catch(e=>setError(e.message)).finally(()=>setPending(false));
 }
 const disabled=pending||preferences===null;
 const quietDescription=preferences?.quietEnabled
  ?`Quiet hours: ${preferences.quietStart}–${preferences.quietEnd} (${preferences.quietZone}).${preferences.quietStart===preferences.quietEnd?' Notifications are silenced all day.':''}`
  :'Your personal quiet hours will be honored when enabled in lobby Settings → Notifications.';
 const devicePanel=(deviceEnabled||!matchId)&&<div className={`space-y-2${matchId?' border-t pt-3':''}`}>
  <h4 className="font-medium">This device{!matchId&&<span className="ml-2 text-sm font-normal">{deviceEnabled&&state==='enabled'?'Enabled':'Disabled'}</span>}</h4>
  <p role="status" className="text-sm">{deviceEnabled?statusText[state as keyof typeof statusText]:'Phone alerts are not active yet. You can save your preferences now; no notifications will be sent.'}</p>
  {deviceEnabled&&['device-off','permission-needed','revoked'].includes(state)&&<button type="button" className="rounded border px-3 py-2" disabled={pending} onClick={enable}>Enable on this device</button>}
  {deviceEnabled&&state==='enabled'&&<button type="button" className="rounded border px-3 py-2" disabled={pending} onClick={()=>{setPending(true);void device.disableDevice().then(()=>setState(device.status())).catch(()=>setError('Device cleanup could not finish. Please retry.')).finally(()=>setPending(false));}}>Disable on this device</button>}
  {deviceEnabled&&<p className="text-sm">Delivery depends on browser permission, connectivity and device settings such as Do Not Disturb.</p>}
 </div>;
 return <section className="space-y-3 rounded-lg border p-4" aria-label={matchId?'Match push notifications':'Notifications'}>
  {matchId?<div className="flex min-h-11 w-full items-center justify-between gap-3">
   <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><input type="checkbox" aria-label="Enable push notifications for this match" checked={enabled===true} disabled={enabled===null||disabled} onChange={e=>void saveMatch(e.target.checked)}/>Notifications</label>
   <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded border" aria-label="Notification details" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(v=>!v)}><ChevronDown aria-hidden="true" className={`h-5 w-5 transition-transform${expanded?' rotate-180':''}`}/></button>
  </div>:<h3 className="font-semibold"><button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded text-left" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(v=>!v)}>Notifications<ChevronDown aria-hidden="true" className={`h-5 w-5 transition-transform${expanded?' rotate-180':''}`}/></button></h3>}
  <div id={detailsId} hidden={!expanded} className="w-full space-y-3">
  {preview&&<p role="note">Local preview — simulated permission and delivery. No real notifications are sent.</p>}
  {!deviceEnabled&&matchId&&<p role="status" className="text-sm">Phone alerts are not active yet. You can save your preferences now; no notifications will be sent.</p>}
  {!matchId&&devicePanel}
  {matchId?<>
   <p className="text-sm">Your turn alerts and 24-hour Last Call for this match. {quietDescription}</p>
   <p className="text-sm">Deadlines stay unchanged. After quiet hours, only one still-needed reminder may arrive.</p>
  </>:<>
   {preferences?.registrations!==undefined&&<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={preferences.registrations} disabled={disabled} onChange={e=>void save({registrations:e.target.checked})}/>New User Registrations</label>}
   <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={preferences?.invitations===true} disabled={disabled} onChange={e=>void save({invitations:e.target.checked})}/>Match invitations</label>
   <p className="text-sm">New invitations to you. Open an alert to accept or decline.</p>
   <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={preferences?.asyncDefault===true} disabled={disabled} onChange={e=>void save({asyncDefault:e.target.checked})}/>Your turn</label>
   <p className="text-sm">Default for new async matches, including 24-hour Last Call. Existing matches keep their own settings.</p>
   <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={preferences?.newTable===true} disabled={disabled} onChange={e=>void save({newTable:e.target.checked})}/>New real-money tables</label>
   <p className="text-sm">Eligible tables opening for joining, excluding your own. Never seats you or places a wager.</p>
   <fieldset className="space-y-3 border-t pt-3" disabled={disabled}>
    <legend className="font-medium">Quiet hours</legend>
    <label className="flex items-center gap-3"><input type="checkbox" checked={quiet.quietEnabled} onChange={e=>setQuiet({...quiet,quietEnabled:e.target.checked})}/>Enable quiet hours</label>
    <div hidden={!quiet.quietEnabled} className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
     <label className="text-sm">Start<input className="mt-1 block w-full min-w-0 rounded border bg-background p-2" type="time" value={quiet.quietStart} onChange={e=>setQuiet({...quiet,quietStart:e.target.value})}/></label>
     <label className="text-sm">End<input className="mt-1 block w-full min-w-0 rounded border bg-background p-2" type="time" value={quiet.quietEnd} onChange={e=>setQuiet({...quiet,quietEnd:e.target.value})}/></label>
    </div>
    <label className="block text-sm">Time zone (IANA)<input className="mt-1 block w-full min-w-0 rounded border bg-background p-2" placeholder="America/Chicago" value={quiet.quietZone} onChange={e=>setQuiet({...quiet,quietZone:e.target.value})}/></label>
    <p className="text-sm">Uses this zone’s daylight-saving rules, even when traveling. Start included, end excluded; equal times silence all day.</p>
    </div>
    <p className="text-sm">Applies to all phone alerts. Pending invitations and turn reminders wait; table-opening alerts are dropped. Deadlines and in-app indicators stay unchanged.</p>
    <button type="button" className="rounded border px-3 py-2" onClick={()=>void save({quietEnabled:quiet.quietEnabled,quietStart:quiet.quietStart,quietEnd:quiet.quietEnd,quietZone:quiet.quietZone})}>Save quiet hours</button>
   </fieldset>
  </>}
  {matchId&&devicePanel}
  </div>
  {saved&&!error&&<p role="status" className="text-sm">{saved}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
