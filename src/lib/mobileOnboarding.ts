import {accountRpc} from './accountAccess';

export const ONBOARDING_VERSION=1;
export type MobilePlatform='iphone'|'android';
export type OnboardingDecision='snooze'|'dismiss'|'complete';
export interface OnboardingPreference {userId:string;version:number;eligible:boolean;completed:boolean;dismissed:boolean;snoozedUntil:string|null}
export function detectMobile(ua:string,platform='',touches=0):{platform:MobilePlatform; supported:boolean; chromeIOS:boolean} {
 const ios=/iPhone|iPad|iPod/.test(ua)||(platform==='MacIntel'&&touches>1);
 const android=/Android/.test(ua);
 const embedded=/; wv\)|FBAN|FBAV|Instagram|Line\/|GSA\//i.test(ua);
 const supported=!embedded&&(ios&&/Safari|CriOS|FxiOS|EdgiOS/.test(ua)||android&&/Chrome|Firefox|SamsungBrowser|EdgA/.test(ua));
 return {platform:android?'android':'iphone',supported,chromeIOS:ios&&/CriOS/.test(ua)};
}
export function isStandalone() {
 return window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
}
export function isFreshMobileEntry(e:{supported:boolean;standalone:boolean;path:string;search:string;hash:string;navigation?:string;discarded:boolean;redirect:boolean}) {
 return e.supported&&!e.standalone&&!e.discarded&&!e.redirect&&e.navigation==='navigate'
  &&['/','/auth'].includes(e.path)&&['','?launch=home'].includes(e.search)&&!e.hash;
}
// One document-entry decision; routes, focus, token refresh and snooze expiry cannot re-arm it.
const checked=new Set<string>();
function captureEntry(explicitLogin=false) { try {
 const mobile=detectMobile(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
 return !document.hidden&&isFreshMobileEntry({supported:mobile.supported,standalone:isStandalone(),path:location.pathname,
  search:location.search,hash:location.hash,navigation:explicitLogin?'navigate':(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type,
  discarded:!!(document as Document&{wasDiscarded?:boolean}).wasDiscarded,redirect:!!sessionStorage.getItem('redirectAfterAuth')});
} catch { return false; /* Manual Help remains available. */ } }
let entryEligible=captureEntry(),signedOut=false;
let pushReady=import.meta.env.VITE_ASYNC_PUSH_ENABLED!=='true';
const listeners=new Set<()=>void>();
export const subscribePushEntry=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const pushEntryReady=()=>pushReady;
export function resolveOnboardingPushEntry(destination:string|null) {
 if(destination)entryEligible=false;
 pushReady=true;listeners.forEach(fn=>fn());
}
export function claimOnboardingEntry(userId:string) {
 if(!entryEligible||isStandalone()||checked.has(userId))return false;
 checked.add(userId);return true;
}
export function cancelOnboardingEntry(){entryEligible=false;}
export function onboardingAuthEvent(event:string) {
 if(event==='SIGNED_OUT'){signedOut=true;entryEligible=false;checked.clear();}
 if(event==='SIGNED_IN'&&signedOut){signedOut=false;entryEligible=captureEntry(true);pushReady=import.meta.env.VITE_ASYNC_PUSH_ENABLED!=='true';listeners.forEach(fn=>fn());}
}
if(typeof window!=='undefined') {
 window.addEventListener('pagehide',cancelOnboardingEntry);
 window.addEventListener('popstate',cancelOnboardingEntry);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelOnboardingEntry();});
}
export async function onboardingPreference(userId:string,action:'read'|'present'|OnboardingDecision='read',requestId?:string) {
 return accountRpc<OnboardingPreference>('mobile_onboarding_preference',{p_action:action,p_version:ONBOARDING_VERSION,p_request_id:requestId??null,p_user_id:userId});
}
