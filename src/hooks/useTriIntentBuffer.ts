import {useEffect,useMemo,useReducer,useRef} from 'react';
import {TriIntentBuffer,type IntentView,type FrozenIntent} from '@/lib/triTowers/intentBuffer';
export function useTriIntentBuffer(identity:string,read:()=>IntentView|null,send:(command:FrozenIntent)=>Promise<IntentView>,enabled=true){
 const callbacks=useRef({read,send});callbacks.current={read,send};const [,render]=useReducer(n=>n+1,0);
 const buffer=useMemo(()=>new TriIntentBuffer({key:'tri-pending:'+identity,read:()=>callbacks.current.read(),send:c=>callbacks.current.send(c),change:()=>render(),storage:typeof sessionStorage==='undefined'?undefined:sessionStorage}),[identity]);
 useEffect(()=>{if(enabled)buffer.restore();});
 useEffect(()=>{if(!enabled)return;const stop=()=>buffer.interrupt();const visibility=()=>{if(document.hidden)stop();};window.addEventListener('offline',stop);document.addEventListener('visibilitychange',visibility);return()=>{buffer.interrupt();window.removeEventListener('offline',stop);document.removeEventListener('visibilitychange',visibility);};},[buffer,enabled]);
 return buffer;
}
