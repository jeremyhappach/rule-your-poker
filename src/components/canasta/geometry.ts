import {useSyncExternalStore} from 'react';
import {registerDomain} from '@/lib/geometryLab/defaultsRegistry';
import {intersects,type Rect} from '@/lib/run21/safeFelt';
export const CANASTA_GEOMETRY_KEY='canasta_presentation';
export const CANASTA_GEOMETRY_DEFAULTS={cardWidth:48,handOverlap:.14,meldOverlap:.14,summaryWidth:.86,pileBottom:.94,pileGap:.16};
export type CanastaGeometry=typeof CANASTA_GEOMETRY_DEFAULTS;
export const CANASTA_GEOMETRY_BOUNDS={cardWidth:[44,72],handOverlap:[0,.14],meldOverlap:[0,.14],summaryWidth:[.5,.9],pileBottom:[.7,.97],pileGap:[.08,.5]} as const;
export function sanitizeCanastaGeometry(raw:unknown):CanastaGeometry{
  const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  return Object.fromEntries(Object.entries(CANASTA_GEOMETRY_DEFAULTS).map(([key,fallback])=>{
    const [min,max]=CANASTA_GEOMETRY_BOUNDS[key as keyof CanastaGeometry],n=value[key];
    return [key,typeof n==='number'&&Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback];
  })) as CanastaGeometry;
}
let committed=CANASTA_GEOMETRY_DEFAULTS,preview:CanastaGeometry|null=null;
const listeners=new Set<()=>void>(),notify=()=>listeners.forEach(fn=>fn());
export function previewCanastaGeometry(value:CanastaGeometry|null){preview=value?sanitizeCanastaGeometry(value):null;notify();}
export const getCanastaGeometry=()=>preview??committed;
export function useCanastaGeometry(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getCanastaGeometry,getCanastaGeometry);}
registerDomain({key:CANASTA_GEOMETRY_KEY,defaults:CANASTA_GEOMETRY_DEFAULTS,sanitize:sanitizeCanastaGeometry,onApply:next=>{committed=next;preview=null;notify();}});

export function fanLayout(available:number,count:number,width:number,overlap:number,interactive:boolean){
  const step=Math.max(interactive?44:0,width*(1-Math.min(.14,Math.max(0,overlap))));
  const columns=Math.max(1,Math.min(count||1,Math.floor((available-width)/step)+1));
  return {width,step,columns,height:Math.round(width*62/44)};
}
const empty=():Rect=>({x:.5,y:.5,width:0,height:0});
/** Canasta-only packing inside the measured canonical felt, excluding shell seats. */
export function canastaFeltRects(reserved:Rect[],width:number,height:number,config:CanastaGeometry){
  if(width<=0||height<=0)return {summary:empty(),piles:empty()};
  const obstacles=reserved.map(r=>({x:r.x-.015,y:r.y-.015,width:r.width+.03,height:r.height+.03}));
  const clear=(r:Rect)=>[r.x,r.x+r.width].every(x=>[r.y,r.y+r.height].every(y=>(2*x-1)**2+(2*y-1)**2<=.985))&&!obstacles.some(o=>intersects(r,o));
  const card=Math.max(28,Math.min(44,height*.24)),gap=44*config.pileGap,pw=(2*Math.max(44,card+12)+gap)/width,ph=(Math.round(card*62/44)+20)/height;
  const candidates:Rect[]=[];
  for(const center of [.5,.45,.55,.4,.6,.35,.65])for(let bottom=config.pileBottom;bottom>=.5;bottom-=.01){
    const r={x:center-pw/2,y:bottom-ph,width:pw,height:ph};if(clear(r)){candidates.push(r);break;}
  }
  let piles=candidates[0]??empty();
  let summary=empty(),area=0;
  for(let left=.04;left<=.761;left+=.02)for(let right=left+.2;right<=.961;right+=.02){
    if(right-left>config.summaryWidth+.001)continue;
    for(let top=.08;top<=.72;top+=.02)for(let bottom=.3;bottom<=.94;bottom+=.02){
      const r={x:left,y:top,width:right-left,height:bottom-top};
      if(r.height*height<43.999||r.width*width<59.999||r.width*r.height<=area||!clear(r))continue;
      const candidate=candidates.find(p=>!intersects(r,{x:p.x-.01,y:p.y-.01,width:p.width+.02,height:p.height+.02}));
      if(candidates.length&&!candidate)continue;
      summary=r;area=r.width*r.height;if(candidate)piles=candidate;
    }
  }
  return {summary,piles};
}
