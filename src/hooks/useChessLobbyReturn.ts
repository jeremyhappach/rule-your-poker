import {useCallback,useEffect,useState} from 'react';

export const CHESS_LOBBY_HOLD_MS=5000;

/** Presentation-only hold after the accepted move finishes; never advances a turn. */
export function useChessLobbyReturn(onReturn:()=>void){
 const [returnAt,setReturnAt]=useState<number|null>(null);
 const complete=useCallback(()=>setReturnAt(prior=>prior??performance.now()+CHESS_LOBBY_HOLD_MS),[]);
 useEffect(()=>{
  if(returnAt===null)return;
  const timer=setTimeout(onReturn,Math.max(0,returnAt-performance.now()));
  return()=>clearTimeout(timer);
 },[returnAt,onReturn]);
 return {holding:returnAt!==null,complete};
}
