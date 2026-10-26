import {useLayoutEffect,useRef,useState,type ComponentProps,type CSSProperties} from 'react';
import {CanonicalLifeMarkers,CHIP_LIFE_SIZE,CHIP_LIFE_GAP,LIFE_LOSS_MAX_SCALE} from './CanonicalLifeMarkers';

/** Fit only the lives inside the canonical seat frame. Never move the chip. */
export function CanonicalChipLives(props:ComponentProps<typeof CanonicalLifeMarkers>){
 const ref=useRef<HTMLSpanElement>(null);
 const [direction,setDirection]=useState({x:Math.SQRT1_2,y:Math.SQRT1_2});
 useLayoutEffect(()=>{
  const anchor=ref.current,disc=anchor?.closest('[data-chip-center]')?.querySelector<HTMLElement>('[data-chip-reaction-target]'),frame=anchor?.closest('[data-canonical-seat-frame]'),cluster=anchor?.closest('[data-canonical-seat-cluster]');
  if(!disc||!frame)return;
  const measure=()=>{
   const c=disc.getBoundingClientRect(),f=frame.getBoundingClientRect();
   if(!c.width||!disc.offsetWidth)return;
   const scale=c.width/disc.offsetWidth,R=c.width/2;
   // Reserve the full three-life dissolve envelope, including one marker
   // border's clearance. This keeps the row stable throughout the animation.
   const enlarged=CHIP_LIFE_SIZE/2*LIFE_LOSS_MAX_SCALE*scale;
   const trailing=2*(CHIP_LIFE_SIZE+CHIP_LIFE_GAP)*scale;
   const room=f.right-(c.left+R)-scale;
   const x=Math.max(0,Math.min(Math.SQRT1_2,(room-trailing-enlarged)/(R+enlarged)));
   const y=Math.sqrt(1-x*x);
   setDirection(old=>Math.abs(old.x-x)<.00001?old:{x,y});
  };
  measure();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  observer?.observe(disc);observer?.observe(frame);
  cluster?.addEventListener('transitionend',measure);
  return()=>{observer?.disconnect();cluster?.removeEventListener('transitionend',measure);};
 },[]);
 const radius=CHIP_LIFE_SIZE/2;
 const style={position:'absolute',left:`calc(50% + (var(--canonical-chip-radius) + ${radius}px) * ${direction.x} - ${radius}px)`,top:`calc(50% + (var(--canonical-chip-radius) + ${radius}px) * ${direction.y} - ${radius}px)`,display:'flex',lineHeight:1,zIndex:20,color:'#facc15',textShadow:'0 1px 2px #000','--canonical-life-contact':`${(1-direction.x)*50}% ${(1-direction.y)*50}%`} as CSSProperties;
 return <span ref={ref} data-canonical-leg-anchor="seat" style={style}><CanonicalLifeMarkers {...props} variant="chip"/></span>;
}
