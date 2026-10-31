import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import {PushPreferences} from '../../src/components/delayed/PushPreferences';
import {deviceStatus} from '../../src/lib/webPush/device.mjs';
import type {delayedRpc} from '../../src/lib/delayed/client';
let viewer='alex',permission='default',subscribed=false,mode='supported';
const get=()=>JSON.parse(localStorage.getItem('push-local-preview')??'{}');
const rpc:typeof delayedRpc=async(name,args={})=>{const all=get(),key=viewer+':'+(args.p_match??'default');
 if(name==='notification_preferences'){
  const p={asyncDefault:all[viewer+':default']??false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC',...all[viewer+':settings'],...args.p_patch as object};
  all[viewer+':default']=p.asyncDefault;all[viewer+':settings']=p;localStorage.setItem('push-local-preview',JSON.stringify(all));return p as any;
 }
 if(args.p_enabled!==undefined){all[key]=args.p_enabled;localStorage.setItem('push-local-preview',JSON.stringify(all));}return (all[key]??false) as any;};
const device={prepare:()=>{},status:()=>deviceStatus({ios:mode==='iphone-tab',standalone:false,secure:true,supported:mode!=='unsupported',permission},subscribed),
 enableDevice:async()=>{permission=mode==='denied'?'denied':'granted';subscribed=permission==='granted';window.dispatchEvent(new Event('ptown-push-device-change'));return device.status();},disableDevice:async()=>{subscribed=false;window.dispatchEvent(new Event('ptown-push-device-change'));}};
function Preview(){const [version,update]=useState(0),[match,setMatch]=useState(()=>localStorage.getItem('push-local-preview-match')??'existing');
 return <main><p className="banner">LOCAL MOCK · No production account, permission prompt, or notification delivery</p><h1>Ptown notification settings</h1>
 <div className="controls"><label>Viewer <select aria-label="Viewer" onChange={e=>{viewer=e.target.value;subscribed=false;permission='default';update(version+1);}}><option value="alex">Alex</option><option value="blair">Blair</option></select></label>
 <label>Device simulation <select aria-label="Device simulation" onChange={e=>{mode=e.target.value;permission=mode==='denied'?'denied':'default';subscribed=mode==='revoked';update(version+1);}}><option value="supported">Supported browser</option><option value="iphone-tab">iPhone browser tab</option><option value="denied">Permission denied</option><option value="revoked">Permission revoked</option><option value="unsupported">Unsupported</option></select></label>
 <button onClick={()=>{const id=crypto.randomUUID(),all=get();for(const u of ['alex','blair'])all[u+':'+id]=all[u+':default']??false;localStorage.setItem('push-local-preview',JSON.stringify(all));localStorage.setItem('push-local-preview-match',id);setMatch(id);}}>Create mock match from defaults</button></div>
 <PushPreferences key={'global'+version} userId={viewer} device={device} rpc={rpc} preview/>
 <h2>Match landing · {match==='existing'?'Existing match':'New match'}</h2><p>Changing Alex’s checkbox does not change Blair’s preference. Reload to check persistence. Existing matches start off.</p>
 <PushPreferences key={match+version} userId={viewer} matchId={match} device={device} rpc={rpc} preview/></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
