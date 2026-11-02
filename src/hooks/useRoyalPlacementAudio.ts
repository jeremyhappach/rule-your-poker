import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedSound} from '@/lib/audio/approvedSounds';
import type {RoyalSnapshot} from '@/lib/royalFlash/model';
/** Only newly confirmed placements sound; reconnect/observer admission is silent. */
export function useRoyalPlacementAudio(view:RoyalSnapshot,userId:string,epoch:number,active:boolean){
 const previous=useRef<{scope:string;revision:number;placements:number;epoch:number;active:boolean;userId:string}|null>(null);
 useEffect(()=>{
  const next={scope:view.scope,revision:view.revision,placements:view.board.placements,epoch,active,userId},prior=previous.current;previous.current=next;
  if(!active||!prior?.active||userId!==prior.userId||epoch!==prior.epoch||next.scope!==prior.scope||next.revision<=prior.revision||next.placements!==prior.placements+1)return;
  platformAudio.present({userId,id:`royal-place:${next.scope}:${next.placements}`,cue:approvedSound('slide')});
 },[view.scope,view.revision,view.board.placements,userId,epoch,active]);
}
