import {useLayoutEffect,useRef,useState,type ComponentProps} from 'react';
import {PlayingCard} from '@/components/PlayingCard';

/** Faces use the actual canonical artifact width, including compact seat previews. */
export function TableauCard(props:Omit<ComponentProps<typeof PlayingCard>,'faceFillPx'>) {
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
 useLayoutEffect(()=>{
  const element=ref.current;if(!element)return;
  const measure=()=>setWidth(element.getBoundingClientRect().width);
  measure();const observer=new ResizeObserver(measure);observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 return <div ref={ref} style={{width:'100%',height:'100%'}}><PlayingCard {...props} faceFillPx={width||undefined}/></div>;
}
