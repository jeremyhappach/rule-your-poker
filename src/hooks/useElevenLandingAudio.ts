import {useLayoutEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {elevenLandingCue} from '@/lib/elevenUp/ballSounds';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';

/** The confirmed incoming ball now occupies a felt slot. The commit is contact:
 * no speculative Pass sound, render replay, initial rack or recovery catch-up. */
export function useElevenLandingAudio(view:ElevenSnapshot,userId:string,epoch:number,active:boolean){
 const previous=useRef<{view:ElevenSnapshot;userId:string;epoch:number;active:boolean}|null>(null);
 useLayoutEffect(()=>{
  const prior=previous.current;previous.current={view,userId,epoch,active};
  if(!active||!prior?.active||prior.epoch!==epoch||prior.userId!==userId||prior.view.scope!==view.scope||view.revision<=prior.view.revision)return;
  const incoming=prior.view.board.current;
  if(incoming===null||!['ready','playing'].includes(prior.view.board.phase))return;
  const slot=view.board.slots.indexOf(incoming);
  if(slot<0||prior.view.board.slots[slot]===incoming)return;
  platformAudio.present({userId,id:`eleven-land:${view.scope}:${view.revision}:${incoming}:${slot}`,cue:elevenLandingCue});
 },[view,userId,epoch,active]);
}
