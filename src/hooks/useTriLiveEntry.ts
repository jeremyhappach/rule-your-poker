import {useRef} from 'react';
/** The persistent session route witnesses new gameplay; a fresh route has no live entry. */
export function useTriLiveEntry(session:string|null|undefined,dealer:string|null|undefined,type:string|null|undefined,status:string|null|undefined){
 const prior=useRef<{session:string;key:string}|null>(null),live=useRef<string|null>(null);
 const key=[dealer,type,status].join(':');
 if(session){
  if(prior.current?.session!==session)live.current=null;
  else if(prior.current.key!==key)live.current=!document.hidden&&navigator.onLine?dealer??null:null;
  prior.current={session,key};
 }
 return !!dealer&&live.current===dealer;
}
