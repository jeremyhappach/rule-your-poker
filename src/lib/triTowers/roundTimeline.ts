/** Normal result offsets. V4 all-clear prepends its authoritative celebration window. */
export const TRI_ROUND_TIMELINE = {countStart:1200,clearCountStart:3100,countEnd:4000,homeAt:4300} as const;
export const clampUnit=(n:number)=>Math.max(0,Math.min(1,n));
export function triCountWindow(cleared=false,celebrationMs=0){
 return {start:celebrationMs?celebrationMs+TRI_ROUND_TIMELINE.countStart:cleared?TRI_ROUND_TIMELINE.clearCountStart:TRI_ROUND_TIMELINE.countStart,end:celebrationMs+TRI_ROUND_TIMELINE.countEnd};
}
export function triResultTimeline(elapsed:number,cleared=false,celebrationMs=0){
 const {start:countStart,end:countEnd}=triCountWindow(cleared,celebrationMs),homeAt=celebrationMs+TRI_ROUND_TIMELINE.homeAt;
 return {progress:clampUnit((elapsed-countStart)/(countEnd-countStart)),
  center:Math.min(clampUnit((elapsed-celebrationMs)/200),clampUnit((homeAt-elapsed)/(homeAt-countEnd))),
  crest:clampUnit(((celebrationMs||countEnd)-elapsed)/350)};
}
export function triDealProgress(elapsed:number,index:number|'stock'|'upcard'){
 const start=index==='stock'?1600:index==='upcard'?1800:300+index*40;
 return clampUnit((elapsed-start)/(index==='upcard'?400:200));
}

// An explicit Start response authorizes presentation on the following route only.
// This is memory-only: reload/reconnect cannot recreate the ticket or any deadline.
const starts=new Set<string>();
export function grantTriStart(id:string){starts.add(id);}
export function hasTriStart(id:string){return starts.has(id);}
export function retireTriStart(id:string){starts.delete(id);}
