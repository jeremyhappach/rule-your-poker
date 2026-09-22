import {useLayoutEffect,useState} from 'react';
import {drawPairRect,drawHelpRect,drawPassRect,safeFeltRect,type Rect} from '@/lib/run21/safeFelt';
import type {Run21Geometry} from '@/lib/run21/geometry';
export const RESERVED_SELECTOR='[data-canonical-felt-plate], [data-canonical-seat-cluster], [data-canonical-seat-cluster] *, [data-chip-center], [data-canonical-dealer-pip], [data-canonical-shell-hud-grid], [data-canonical-shell-tabbar], .run21-lab-header';
export function useSafeFelt(layer:HTMLElement|null,identity:string,geometry:Run21Geometry,hasDrawCards:boolean){
  const [layout,setLayout]=useState<{area:Rect;draw:Rect}>({area:{x:.5,y:.5,width:0,height:0},draw:{x:.5,y:.5,width:0,height:0}});
  useLayoutEffect(()=>{
    if(!layer)return;
    const root=layer.closest('[data-canonical-shell-root]')!;
    // The transparent viewer endpoint remains available to chip transport.
    // It is a geometry marker, not visible chrome that consumes play space.
    const nodes=[...root.querySelectorAll<HTMLElement>(RESERVED_SELECTOR)].filter(n=>!n.closest('[data-canonical-shell-viewer-chip-endpoint]'));
    const measure=()=>{
      const felt=layer.getBoundingClientRect();
      if(!felt.width||!felt.height)return;
      const reserved=nodes.map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({x:(r.x-felt.x)/felt.width,y:(r.y-felt.y)/felt.height,width:r.width/felt.width,height:r.height/felt.height}));
      const aspect=felt.width/felt.height;
      const draw=drawPairRect(reserved,aspect,geometry.controlsY,hasDrawCards);
      const area=safeFeltRect([...reserved,drawHelpRect(draw),...(hasDrawCards?[draw,drawPassRect(draw)]:[])],aspect);
      const next={area,draw};
      setLayout(prior=>JSON.stringify(prior)===JSON.stringify(next)?prior:next);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(layer);nodes.forEach(n=>observer.observe(n));measure();
    return()=>observer.disconnect();
  },[layer,identity,geometry,hasDrawCards]);
  return layout;
}
