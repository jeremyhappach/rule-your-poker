type Sample={at:number;kind:string;id?:string;ms?:number;detail?:string};
const samples:Sample[]=[];
let enabled:boolean|undefined;
export function triTimingEnabled(){if(enabled!==undefined)return enabled;try{const option=new URLSearchParams(location.search).get('triTiming');if(option==='1'||option==='0')sessionStorage.setItem('tri-timing',option);return enabled=sessionStorage.getItem('tri-timing')==='1';}catch{return enabled=false;}}
export function triTiming(kind:string,id?:string,ms?:number,detail?:string){if(!triTimingEnabled())return;samples.push({at:performance.now(),kind,id,ms,detail});if(samples.length>512)samples.shift();}
export function triInputTiming(kind:string,timeStamp:number){triTiming(kind,undefined,timeStamp>0&&timeStamp<=performance.now()?performance.now()-timeStamp:undefined,'event age; physical touch onset unavailable');}
export function triPaintTiming(id:string){if(!triTimingEnabled())return;triTiming('react-commit',id);requestAnimationFrame(()=>requestAnimationFrame(()=>triTiming('paint-opportunity',id)));}
triTimingEnabled(); // Preserve the opt-in before Arcade navigation removes its query string.
export function downloadTriTiming(){const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,userAgent:navigator.userAgent,limits:'Paint opportunity is not physical screen presentation. Browser event timestamp is not physical touch onset. RPC duration includes network and database.',samples},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tritowers-timing.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
