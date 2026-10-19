import {beginRun21Timing,run21Timing,run21TimingEnabled,run21TimingPayload} from './diagnostics';
export type TimingGrant={serverNow:number;expiresAt:number};
export type TimingSave=(samples:unknown[][],signal:AbortSignal)=>Promise<void>;
// At most one final upload can outlive a game mount. New teardown replaces it.
let cancelFinal:(()=>void)|undefined;
function saveFinal(samples:NonNullable<Window['__RUN21_TIMINGS__']>,save:TimingSave){
 cancelFinal?.();
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const run=()=>{timer=setTimeout(()=>controller.abort(),8000);void save(run21TimingPayload(samples),controller.signal).catch(()=>{}).finally(()=>{clearTimeout(timer);if(cancelFinal===cancel)cancelFinal=undefined;});};
 const idle=window.requestIdleCallback?window.requestIdleCallback(run,{timeout:2000}):window.setTimeout(run,0);
 const cancel=()=>{if(window.cancelIdleCallback)window.cancelIdleCallback(idle);else clearTimeout(idle);clearTimeout(timer);controller.abort();};
 cancelFinal=cancel;
}
/** One owner per mounted Run21 game. No work is scheduled by an individual move. */
export function startRun21TimingCapture(grant:TimingGrant,save:TimingSave){
 const end=beginRun21Timing(grant.serverNow,grant.expiresAt);
 let stopped=false,inFlight=false,idle=0,request:AbortController|undefined,requestTimer:ReturnType<typeof setTimeout>|undefined;
 let lastSample:unknown,lastFrame=0;
 const flush=async()=>{
  if(stopped||inFlight||!run21TimingEnabled())return;
  const newest=window.__RUN21_TIMINGS__?.at(-1);if(!newest||newest===lastSample)return;
  const samples=run21TimingPayload();inFlight=true;request=new AbortController();
  requestTimer=setTimeout(()=>request?.abort(),8000);
  try{await save(samples,request.signal);lastSample=newest;}catch{/* Keep the bounded window for the next batch. */}
  finally{clearTimeout(requestTimer);requestTimer=undefined;request=undefined;inFlight=false;}
 };
 const schedule=()=>{
  if(stopped||idle)return;
  // Serialization and the upload start outside input handlers, at idle priority.
  if(window.requestIdleCallback)idle=window.requestIdleCallback(()=>{idle=0;void flush();},{timeout:2000});
  else idle=window.setTimeout(()=>{idle=0;void flush();},0);
 };
 const online=()=>run21Timing('online'),offline=()=>run21Timing('offline'),focus=()=>run21Timing('focus');
 const visibility=()=>{lastFrame=0;run21Timing(document.hidden?'hidden':'visible');};
 window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
 let observer:PerformanceObserver|undefined;
 try{if(typeof PerformanceObserver!=='undefined'){observer=new PerformanceObserver(list=>{if(stopped)return;for(const entry of list.getEntries())run21Timing('long-task','',entry.duration);});observer.observe({type:'longtask'});}}catch{observer?.disconnect();observer=undefined;}
 // Safari lacks Long Tasks. One RAF callback records only visible gaps >100ms.
 let frame=0;const tick=(at:number)=>{if(!stopped){if(!document.hidden&&lastFrame&&at-lastFrame>100)run21Timing('frame-gap','',at-lastFrame);lastFrame=document.hidden?0:at;frame=requestAnimationFrame(tick);}};
 frame=requestAnimationFrame(tick);
 const batch=setInterval(schedule,30000);
 const expiry=setTimeout(()=>stop(),Math.max(0,grant.expiresAt-grant.serverNow));
 function stop(){
  if(stopped)return;run21Timing('capture-stop');stopped=true;
  const finalSamples=window.__RUN21_TIMINGS__;
  if(run21TimingEnabled()&&finalSamples?.length)saveFinal(finalSamples.slice(),save);
  clearInterval(batch);clearTimeout(expiry);clearTimeout(requestTimer);request?.abort();
  if(idle){if(window.cancelIdleCallback)window.cancelIdleCallback(idle);else clearTimeout(idle);}
  cancelAnimationFrame(frame);observer?.disconnect();
  window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);
  end();
 }
 run21Timing('capture-start');return stop;
}
