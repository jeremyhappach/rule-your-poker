import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import type {AudioCue} from '@/lib/audio/audioManager';
import type {RoyalSnapshot} from '@/lib/royalFlash/model';
const placement:AudioCue={durationMs:65,schedule(ctx,destination,track){
 const gain=track(ctx.createGain()),tone=track(ctx.createOscillator()),at=ctx.currentTime;
 tone.type='sine';tone.frequency.setValueAtTime(680,at);tone.frequency.exponentialRampToValueAtTime(440,at+.06);
 gain.gain.setValueAtTime(.035,at);gain.gain.exponentialRampToValueAtTime(.001,at+.06);
 tone.connect(gain);gain.connect(destination);tone.start(at);tone.stop(at+.065);return true;
}};
/** Only newly confirmed placements sound; reconnect/observer admission is silent. */
export function useRoyalPlacementAudio(view:RoyalSnapshot,userId:string,epoch:number,active:boolean){
 const previous=useRef<{scope:string;revision:number;placements:number;epoch:number;active:boolean;userId:string}|null>(null);
 useEffect(()=>{
  const next={scope:view.scope,revision:view.revision,placements:view.board.placements,epoch,active,userId},prior=previous.current;previous.current=next;
  if(!active||!prior?.active||userId!==prior.userId||epoch!==prior.epoch||next.scope!==prior.scope||next.revision<=prior.revision||next.placements!==prior.placements+1)return;
  return platformAudio.request({userId,id:`royal-place:${next.scope}:${next.placements}`,expiresAt:performance.now()+180,cue:placement});
 },[view.scope,view.revision,view.board.placements,userId,epoch,active]);
}
