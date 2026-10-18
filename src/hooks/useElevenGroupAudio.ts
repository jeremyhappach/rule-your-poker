import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {elevenGroupDing} from '@/lib/elevenUp/groupDing';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
export function useElevenGroupAudio(view:ElevenSnapshot,userId:string,epoch:number,active:boolean){
 const previous=useRef<{scope:string;revision:number;groups:number;epoch:number;active:boolean;userId:string}|null>(null);
 useEffect(()=>{
  const next={scope:view.scope,revision:view.revision,groups:view.board.groups,epoch,active,userId},prior=previous.current;previous.current=next;
  if(!active||!prior?.active||userId!==prior.userId||epoch!==prior.epoch||next.scope!==prior.scope||next.revision<=prior.revision||next.groups<=prior.groups)return;
  // A subscription and its command response identify the same confirmed group.
  return platformAudio.request({userId,id:`eleven-group:${next.scope}:${next.groups}`,expiresAt:performance.now()+180,cue:elevenGroupDing});
 },[view.scope,view.revision,view.board.groups,userId,epoch,active]);
}
