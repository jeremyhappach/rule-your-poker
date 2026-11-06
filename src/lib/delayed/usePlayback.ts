import {useEffect,useRef,useState} from 'react';
export function useVisible(){
 const [active,setActive]=useState(!document.hidden&&navigator.onLine);
 useEffect(()=>{const update=()=>setActive(!document.hidden&&navigator.onLine);document.addEventListener('visibilitychange',update);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 return active;
}
export function usePlayback(duration:number,key:string){
 const active=useVisible(),[frame,setFrame]=useState({key,elapsed:0}),origin=useRef<number|null>(null);
 useEffect(()=>{origin.current=null;setFrame({key,elapsed:0});},[key]);
 useEffect(()=>{if(!active){origin.current=null;return;}if(frame.key===key&&frame.elapsed>=duration)return;origin.current=performance.now();const id=setInterval(()=>{const elapsed=Math.min(duration,performance.now()-(origin.current??performance.now()));setFrame({key,elapsed});if(elapsed>=duration)clearInterval(id);},50);return()=>clearInterval(id);},[active,duration,key]);
 const elapsed=frame.key===key?frame.elapsed:0;
 return {elapsed,active,done:active&&elapsed>=duration};
}
