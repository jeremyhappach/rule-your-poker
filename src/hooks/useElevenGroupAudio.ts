import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {elevenGroupDing} from '@/lib/elevenUp/groupDing';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
import {confirmedBotGroup} from './useElevenBotSelection';
export function useElevenGroupAudio(view:ElevenSnapshot,userId:string,epoch:number,active:boolean,presentedGroup:number|null=null){
 const previous=useRef<{view:ElevenSnapshot;epoch:number;active:boolean;userId:string}|null>(null);
 const pending=useRef<number|null>(null);
 useEffect(()=>{
  const prior=previous.current;previous.current={view,epoch,active,userId};
  if(!active||!prior?.active||userId!==prior.userId||epoch!==prior.epoch||view.scope!==prior.view.scope){pending.current=null;return;}
  const automatic=!view.solo&&view.players.some(p=>p.active&&(p.isBot||p.autoplay));
  if(view.revision>prior.view.revision&&view.board.groups>prior.view.board.groups){
   // Automatic groups must reach eleven in the witnessed presentation first.
   // Missing/skipped animation history is never replayed as a late sound.
   pending.current=automatic?(confirmedBotGroup(prior.view,view)?view.board.groups:null):view.board.groups;
  }
  if(pending.current===null)return;
  if(automatic&&presentedGroup!==pending.current)return;
  if(!automatic&&(prior.view.players.some(p=>p.active&&(p.isBot||p.autoplay)))){pending.current=null;return;}
  const group=pending.current;pending.current=null;
  // A subscription and its command response identify the same confirmed group.
  return platformAudio.request({userId,id:`eleven-group:${view.scope}:${group}`,expiresAt:performance.now()+180,cue:elevenGroupDing});
 },[view,userId,epoch,active,presentedGroup]);
}
