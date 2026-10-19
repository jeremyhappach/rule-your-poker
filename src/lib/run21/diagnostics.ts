type ServerSpans=Partial<Record<'total'|'auth'|'database'|'engine'|'gate'|'membership',number>>;
export type Sample={at:number;wallAt:number;stage:string;id:string;round:number;detail?:string;elapsed?:number;server?:ServerSpans};
declare global {interface Window {__RUN21_TIMINGS__?:Sample[];downloadRun21Timing?:()=>void}}
let manual:boolean|undefined,automatic=false,automaticSeen=false,round=0,wallOffset=0,expires=0,monotonicExpiry=0;
const confirmations=new Map<string,string>();
export function run21TimingEnabled(){
 if(automaticSeen)return automatic&&Date.now()+wallOffset<expires&&performance.now()<monotonicExpiry;
 // Production capture requires a live account grant, including after a reload.
 if(import.meta.env.PROD)return false;
 if(manual!==undefined)return manual;
 try{const option=new URLSearchParams(location.search).get('run21Timing');if(option==='1'||option==='0')sessionStorage.setItem('run21-timing',option);
  return manual=sessionStorage.getItem('run21-timing')==='1'||localStorage.getItem('run21-diagnostics')==='1';}catch{return manual=false;}
}
export function beginRun21Timing(serverNow:number,expiresAt:number){
 automaticSeen=true;automatic=expiresAt>serverNow;wallOffset=serverNow-Date.now();expires=expiresAt;monotonicExpiry=performance.now()+Math.max(0,expiresAt-serverNow);
 confirmations.clear();window.__RUN21_TIMINGS__=[];
 return()=>{automatic=false;confirmations.clear();delete window.__RUN21_TIMINGS__;};
}
function serverSpans(detail?:string):ServerSpans|undefined{
 if(!detail)return;
 const result:ServerSpans={};
 const put=(key:keyof ServerSpans,value:unknown)=>{if(typeof value==='number'&&Number.isFinite(value)&&value>=0)result[key]=value;};
 try{
  if(detail.startsWith('{')){
   const trace=JSON.parse(detail);put('total',trace.sentAt-trace.receivedAt);
   if(Array.isArray(trace.rpc))put('database',trace.rpc.slice(0,32).reduce((sum:number,s:any)=>sum+Math.max(0,s.completedAt-s.startedAt),0));
   if(Array.isArray(trace.phases))for(const s of trace.phases.slice(0,32))if(s.name==='tokenVerification')put('auth',s.completedAt-s.startedAt);
   put('gate',trace.databaseAdmission?.gateMs);put('membership',trace.databaseAdmission?.membershipMs);
  }else{
   let database=0;
   for(const match of detail.matchAll(/([a-zA-Z_][a-zA-Z_0-9]*);dur=([0-9.]+)/g)){
    const value=Number(match[2]);if(match[1]==='total'||match[1]==='auth')put(match[1],value);
    else if(match[1].startsWith('arcade_'))database+=value;
   }
   put('database',database);
  }
 }catch{/* Timing headers never affect play. */}
 return Object.keys(result).length?result:undefined;
}
export function run21Timing(stage:string,id='',elapsed?:number,detail?:string){
 if(typeof window==='undefined'||!run21TimingEnabled())return;
 const samples=window.__RUN21_TIMINGS__??=[];
 samples.push({at:performance.now(),wallAt:Date.now()+wallOffset,stage,id,round,elapsed,
  ...(automatic?{server:stage==='response-headers'?serverSpans(detail):undefined}:{detail})});
 if(samples.length>2400)samples.splice(0,samples.length-2400);
}
export function run21RoundTiming(next:number){if(next!==round){round=next;run21Timing('round');}}
export function run21SnapshotTiming(id:string,view:import('./model').BoardProjection,_events=0){
 if(!run21TimingEnabled())return;
 run21RoundTiming(view.roundNumber);
 const player=view.viewerId,key=JSON.stringify([view.identity??view.presentationKey,view.roundId,player])+':'+(player?view.boards[player]?.revision:undefined);
 confirmations.set(key,id);if(confirmations.size>64)confirmations.delete(confirmations.keys().next().value!);
 for(const sample of window.__RUN21_TIMINGS__??[])if(sample.id===key)sample.id=id;
 run21Timing('snapshot-accepted',id);
}
export function run21ConfirmationId(key:string){return confirmations.get(key)??key;}
export function run21InputTiming(stage:string,timeStamp:number){run21Timing(stage,'',timeStamp>0&&timeStamp<=performance.now()?performance.now()-timeStamp:undefined);}
// Only opaque correlation hashes leave the browser; no board, cards, names, tokens or raw headers.
export function run21TimingPayload(samples=window.__RUN21_TIMINGS__??[]){
 const hash=(text:string)=>{let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return(n>>>0).toString(16).padStart(8,'0');};
 return samples.map(s=>[s.at,s.wallAt,s.stage,hash(s.id),s.round,s.elapsed??null,s.server??null]);
}
if(typeof window!=='undefined')window.downloadRun21Timing=()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify({version:2,samples:window.__RUN21_TIMINGS__??[]},null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='run21-timing.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
};
