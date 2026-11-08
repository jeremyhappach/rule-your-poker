import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {usePresentedScoreAudio} from './usePresentedScoreAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';

import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedSound} from '@/lib/audio/approvedSounds';

interface Offer {scope:string;receipt:string;from:number;to:number;startedAt:number;endsAt:number;hasOffer:boolean}
/** Only presents the server's quote. Banking always submits the current command identity. */
export function useBankOffer({scope,receipt,points,bankable,now,live,userId,surface}:{scope:string;receipt:string;points:number|null;bankable:boolean;now:number;live:boolean;userId:string;surface:RefObject<HTMLElement>}){
 const [offer,setOffer]=useState<Offer|null>(null),stopDing=useRef<()=>void>(()=>{});
 useEffect(()=>()=>stopDing.current(),[]);
 useLayoutEffect(()=>{
  if(!live||offer?.scope!==scope||points===null)stopDing.current();
  if(points===null){if(offer?.scope!==scope)setOffer(null);return;}
  if(offer?.scope===scope&&offer.receipt===receipt){if(!live&&offer.from!==offer.to)setOffer({...offer,from:offer.to,endsAt:offer.startedAt});return;}
  const previous=offer?.scope===scope?offer:null;
  const animate=live&&!!previous?.hasOffer&&previous.to!==points;
  const next={scope,receipt,from:animate?previous.to:points,to:points,startedAt:now,endsAt:now+(animate?900:0),hasOffer:!!previous?.hasOffer||bankable};
  setOffer(next);
  if(live&&!previous?.hasOffer&&bankable)platformAudio.present({userId,id:scope+':offer-ding:'+receipt,cue:isSoundSurfaceVisible(surface.current)?approvedSound('scorePost'):undefined},stop=>{stopDing.current=stop;});
 },[scope,receipt,points,bankable,live]);
 const current=offer?.scope===scope?offer:null;
 const moving=live&&current&&current.endsAt>now&&current.from!==current.to;
 usePresentedScoreAudio(userId,moving&&isSoundSurfaceVisible(surface.current)?scope+':offer:'+current.receipt:null,current,now,!!current&&current.to<current.from);
 return points===null?null:current?Math.round(current.from+(current.to-current.from)*Math.min(1,Math.max(0,(now-current.startedAt)/Math.max(1,current.endsAt-current.startedAt)))):points;
}
