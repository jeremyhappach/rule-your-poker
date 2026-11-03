import {useState} from 'react';
import {Link} from 'react-router-dom';
import {runbackUrl} from '@/lib/delayed/runback';

export function RunbackLink({matchId,returnTo,primary=false,label='Run It Back'}:{matchId:string;returnTo:string;primary?:boolean;label?:string}){
 const [draftId,setDraftId]=useState(()=>crypto.randomUUID());
 return <Link className={primary?'delayed-primary':'delayed-secondary'} aria-label={label}
  to={runbackUrl(matchId,returnTo,draftId)} onClick={()=>setDraftId(crypto.randomUUID())}>Run It Back</Link>;
}
