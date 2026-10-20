import {useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
/** Same pill and home slot throughout the round. Only the active pill translates;
 * its opponent and the centered two-player cluster retain their original slots. */
export function BoxdropScorePill({name,value,active,fraction,root,balance}:{name:string;value:number;active:boolean;fraction:number;root:RefObject<HTMLDivElement>;balance?:ReactNode}){
 const home=useRef<HTMLDivElement>(null),[offset,setOffset]=useState({x:0,y:0});
 useEffect(()=>{
  const target=home.current,viewport=root.current;if(!target||!viewport)return;
  const measure=()=>{const a=target.getBoundingClientRect(),b=viewport.getBoundingClientRect();setOffset({x:b.left+b.width/2-a.left-a.width/2,y:b.top+b.height/2-a.top-a.height/2});};
  const observer=new ResizeObserver(measure);observer.observe(target);observer.observe(viewport);measure();return()=>observer.disconnect();
 },[root]);
 return <div ref={home} className="box-score-home" data-active={active}><div className="box-score" data-active={active} data-centered={fraction>0} style={{transform:`translate(${offset.x*fraction}px,${offset.y*fraction}px)`}}><span title={name}>{name}</span><b aria-label={`${name} score ${value}`}>{value.toLocaleString()}</b>{balance}</div></div>;
}
