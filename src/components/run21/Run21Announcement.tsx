import {useEffect,useRef} from 'react';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {run21Announcement} from '@/lib/run21/announcement';
import type {Projection} from '@/lib/run21/model';

export function Run21Announcement({view,dealerGameScope=view.identity.dealerGameId}:{view:Projection;dealerGameScope?:string|null}){
  const api=useAnnouncements();
  const apiRef=useRef(api);apiRef.current=api;
  const {id,title}=run21Announcement(view);
  const roundId=view.roundId;
  useEffect(()=>{
    apiRef.current.emit({id,type:'gameplay_notice',behavior:'ambient',scope:{dealerGameId:dealerGameScope,roundId},payload:{title}});
    // Dismiss only our event on phase/round/viewer changes or replay unmount.
    return()=>apiRef.current.dismiss(id);
  },[id,title,dealerGameScope,roundId]);
  return null;
}
