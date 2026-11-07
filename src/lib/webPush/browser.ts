import {supabase} from '@/integrations/supabase/client';
import {delayedRpc} from '@/lib/delayed/client';
import {createDeviceController} from './controller.mjs';
import {diagnosticUser,diagnosticUntil,pushSnapshot} from './diagnostics.mjs';

export const pushEnabled=import.meta.env.VITE_ASYNC_PUSH_ENABLED==='true';
const storageKey='ptown:push-device:v1';
type Binding={userId:string;id:string;binding:string};
let registration:Promise<ServiceWorkerRegistration>|undefined;
export function binding():Binding|null{try{return JSON.parse(localStorage.getItem(storageKey)??'null');}catch{return null;}}
function environment(){const nav=navigator as Navigator&{standalone?:boolean};return {
 ios:/iPad|iPhone|iPod/.test(nav.userAgent)||nav.platform==='MacIntel'&&nav.maxTouchPoints>1,
 standalone:!!nav.standalone||matchMedia('(display-mode: standalone)').matches,secure:window.isSecureContext,
 supported:'serviceWorker' in nav&&'PushManager' in window&&'Notification' in window&&'locks' in nav,
 permission:'Notification' in window?Notification.permission:'default',
};}
export function prepare(){
 if(!pushEnabled||!environment().supported)return;
 registration??=navigator.serviceWorker.register('/ptown-push-sw.js',{scope:'/',updateViaCache:'none'}).then(async r=>{
  if(!r.active)await navigator.serviceWorker.ready;return r;
 }).catch(e=>{registration=undefined;throw e;});return registration;
}
async function worker(value:Binding|null){
 const reg=await prepare();if(!reg?.active){if(value)throw Error('Device setup unavailable.');return;}
 await new Promise<void>((resolve,reject)=>{const channel=new MessageChannel();
  const timer=setTimeout(()=>{channel.port1.close();reject(Error('Device setup did not respond. Please retry.'));},5000);
  channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};reg.active!.postMessage({type:'push-binding',value},[channel.port2]);});
}
const controller=createDeviceController({environment,load:binding,
 exclusive:async(run:()=>Promise<unknown>)=>{if(!navigator.locks)throw Error('This browser cannot safely enable notifications on a shared device.');return navigator.locks.request('ptown-push-device',run);},
 save:(value:Binding|null)=>{if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);window.dispatchEvent(new Event('ptown-push-device-change'));},worker,
 subscription:async()=> (await prepare())?.pushManager.getSubscription()??null,
 configured:()=>pushEnabled&&!!import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY,
 gesture:()=>navigator.userActivation?.isActive===true,requestPermission:()=>Notification.requestPermission(),
 sessionUser:async()=>{const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session?.user.id??null;},
 subscribe:async()=>{const reg=await prepare();if(!reg)throw Error('Push setup unavailable.');
  const bytes=Uint8Array.from(atob(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  return await reg.pushManager.getSubscription()??reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});},
 register:async(subscription:PushSubscription)=>{const json=subscription.toJSON();return delayedRpc<{id:string;binding:string}>('async_push_subscribe',{p_endpoint:json.endpoint,p_p256dh:json.keys?.p256dh,p_auth:json.keys?.auth});},
 revoke:(old:Binding)=>delayedRpc('async_push_device',{p_id:old.id,p_binding:old.binding,p_disable:true}),
});
export const status=controller.status,enableDevice=controller.enable,disableDevice=controller.clear,reconcile=controller.reconcile,setAccount=controller.setAccount;
let diagnosticFlight:Promise<void>|undefined,lastDiagnostic='';
export function capturePushDiagnostics(userId:string):Promise<void>{
 if(userId!==diagnosticUser||Date.now()>=diagnosticUntil||!environment().standalone||document.visibilityState!=='visible')return Promise.resolve();
 if(diagnosticFlight)return diagnosticFlight;
 diagnosticFlight=(async()=>{
  const localBinding=binding(),reg=await prepare();
  const activeVersion=await new Promise<string>(resolve=>{
   if(!reg?.active){resolve('no-active-worker');return;}
   const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve('unavailable');},1000);
   channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(typeof event.data==='string'?event.data:'invalid');};
   reg.active.postMessage({type:'push-diagnostic-version'},[channel.port2]);
  });
  const report=await pushSnapshot({registration:reg,localBinding,cacheStorage:caches,origin:location.origin,
   permission:environment().permission,standalone:environment().standalone,visibility:document.visibilityState,activeVersion});
  const body=JSON.stringify(report);if(body===lastDiagnostic)return;
  const {data}=await supabase.auth.getSession();if(data.session?.user.id!==diagnosticUser)return;
  const response=await fetch('/api/web-push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({...report,clientAt:Date.now()}),signal:AbortSignal.timeout(5000)});
  if(response.ok)lastDiagnostic=body;
 })().catch(()=>{}).finally(()=>{diagnosticFlight=undefined;});return diagnosticFlight;
}
export async function foreground(matchId:string|null){const device=binding();if(device)await delayedRpc('async_push_device',{p_id:device.id,p_binding:device.binding,p_match:matchId});}

async function registrationMessage(type:string,userId:string,targetId?:string):Promise<{registrationUserId:string}|null>{
 const device=binding();if(!pushEnabled||(device&&device.userId!==userId))return null;
 const reg=await prepare();if(!reg?.active)return null;
 return new Promise((resolve)=>{const channel=new MessageChannel();
  const timeout=setTimeout(()=>{channel.port1.close();resolve(null);},5000);
  channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();resolve(event.data);};
  reg.active!.postMessage({type,binding:device?.binding,ownerId:userId,userId:targetId},[channel.port2]);
 });
}
export async function pendingRegistration(userId:string){
 const result=await registrationMessage('push-pending-registration',userId);
 return result&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.registrationUserId)?result.registrationUserId:null;
}
export async function acknowledgeRegistration(userId:string,targetId:string){
 await registrationMessage('push-registration-opened',userId,targetId);
}
