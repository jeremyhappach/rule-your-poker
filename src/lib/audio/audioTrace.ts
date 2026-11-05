/** Opt-in local diagnostics only. Never records audio, cards, auth or network bodies. */
export const AUDIO_TRACE_LIMIT=1200,AUDIO_TRACE_MS=20*60*1000;
const key='ptown:audio-trace:v1';
type Fields=Record<string,string|number|boolean|null|undefined>;
type Entry=Fields&{at:number;event:string};
interface Capture {version:1;startedAt:number;expiresAt:number;stopped:string|null;build:string;agent:string;standalone:boolean;entries:Entry[]}
let capture:Capture|null=null,writeTimer:ReturnType<typeof setTimeout>|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined;
let snapshot={active:false,saved:false};
const listeners=new Set<()=>void>();
function publish(){snapshot={active:!!capture&&!capture.stopped,saved:!!capture};listeners.forEach(fn=>fn());}
function persist(){clearTimeout(writeTimer);writeTimer=undefined;try{if(capture)localStorage.setItem(key,JSON.stringify(capture));else localStorage.removeItem(key);}catch{/* Export still works from memory. */}}
function stop(reason='stopped'){
 if(!capture||capture.stopped)return;
 capture.stopped=reason;clearTimeout(expiryTimer);persist();publish();
}
function arm(){clearTimeout(expiryTimer);if(capture&&!capture.stopped)expiryTimer=setTimeout(()=>stop('expired'),Math.max(0,capture.expiresAt-Date.now()));}
try{
 const saved=JSON.parse(localStorage.getItem(key)??'null');
 if(saved?.version===1&&Array.isArray(saved.entries)&&saved.entries.length<=AUDIO_TRACE_LIMIT&&Number.isFinite(saved.expiresAt)&&Number.isFinite(saved.startedAt)){
  capture=saved;if(capture!.expiresAt<=Date.now())capture!.stopped??='expired';publish();arm();
 }
}catch{/* Storage is optional; trace defaults off. */}
if(typeof window!=='undefined'){
 window.addEventListener('pagehide',()=>{audioTrace.record('pagehide');persist();});
 document.addEventListener('visibilitychange',()=>{audioTrace.record('visibility',{hidden:document.hidden});if(document.hidden)persist();});
}
export const audioTrace={
 subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
 getSnapshot:()=>snapshot,
 enabled:()=>!!capture&&!capture.stopped&&Date.now()<capture.expiresAt,
 start(){
  const now=Date.now();capture={version:1,startedAt:now,expiresAt:now+AUDIO_TRACE_MS,stopped:null,
   build:String((window as Window&{__APP_BUILD_SHA__?:string}).__APP_BUILD_SHA__??'unknown'),agent:navigator.userAgent.slice(0,512),
   standalone:!!(navigator as Navigator&{standalone?:boolean}).standalone||!!window.matchMedia?.('(display-mode: standalone)').matches,entries:[]};
  persist();arm();publish();this.record('trace-start');
 },
 stop,
 clear(){clearTimeout(expiryTimer);capture=null;persist();publish();},
 record(event:string,fields:Fields={}){
  if(!capture||capture.stopped)return;
  if(Date.now()>=capture.expiresAt){stop('expired');return;}
  capture.entries.push({...fields,event,at:Date.now()});
  if(capture.entries.length>=AUDIO_TRACE_LIMIT){stop('event-limit');return;}
  // Batched storage off the input path; no per-event I/O or React updates.
  writeTimer??=setTimeout(persist,1000);
 },
 export(){persist();return JSON.stringify(capture,null,2);},
};
