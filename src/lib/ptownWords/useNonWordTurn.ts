import {useMemo,useState} from 'react';
import type {WordsSnapshot} from './model';
import {nonWordTurn} from './turnPresentation';

/** Local viewing receipt only; never starts a clock or submits a turn. */
export function useNonWordTurn(v:WordsSnapshot,enabled:boolean){
 const move=v.moves.at(-1),action=move&&nonWordTurn(move);
 const key=`ptown:words:turn:${v.identity.dealerGameId}:${v.viewerId}`;
 const id=move?`${move.playerId}:${move.turn}:${move.action}:${move.reason??''}:${move.count}`:'';
 const saved=useMemo(()=>{try{return sessionStorage.getItem(key);}catch{return null;}},[key,id]);
 const [dismissed,setDismissed]=useState('');
 const visible=enabled&&v.canAct&&v.playDeadline==null&&!v.finished&&!v.paused&&move?.turn===v.turn-1&&move.playerId!==v.viewerId&&action&&saved!==id&&dismissed!==key+id;
 return {
  notice:visible?`${v.players.find(p=>p.id===move.playerId)?.name??'Opponent'} ${action.description}`:null,
  dismiss:()=>{try{sessionStorage.setItem(key,id);}catch{/* Still dismiss for this mount. */}setDismissed(key+id);},
 };
}
