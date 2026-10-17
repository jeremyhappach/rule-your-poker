type Sample={at:number;stage:string;id:string;detail?:string;elapsed?:number};
declare global {interface Window {__RUN21_TIMINGS__?:Sample[];downloadRun21Timing?:()=>void}}
let enabled:boolean|undefined;
export function run21TimingEnabled(){
 if(enabled!==undefined)return enabled;
 try{const option=new URLSearchParams(location.search).get('run21Timing');if(option==='1'||option==='0')sessionStorage.setItem('run21-timing',option);
  return enabled=sessionStorage.getItem('run21-timing')==='1'||localStorage.getItem('run21-diagnostics')==='1';}catch{return enabled=false;}
}
export function run21Timing(stage:string,id='',elapsed?:number,detail?:string){
 if(typeof window==='undefined')return;
 if(!run21TimingEnabled())return;
 const samples=window.__RUN21_TIMINGS__??=[];
 samples.push({at:performance.now(),stage,id,elapsed,detail});if(samples.length>600)samples.splice(0,samples.length-600);
}
export function run21InputTiming(stage:string,timeStamp:number){run21Timing(stage,'',timeStamp>0&&timeStamp<=performance.now()?performance.now()-timeStamp:undefined,'Browser event age; physical touch onset unavailable.');}
if(typeof window!=='undefined'&&run21TimingEnabled())window.downloadRun21Timing=()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,userAgent:navigator.userAgent,limits:'Browser timestamps and animation frames do not measure physical touch or screen presentation. Server spans include remote request latency.',samples:window.__RUN21_TIMINGS__??[]},null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='run21-timing.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
};
